import { sql } from 'drizzle-orm';
import { BaseChecker } from '../base.js';
import { db } from '../../db/client.js';
import {
  CheckerCategory,
  CheckerResult,
  CheckerConfig,
  CheckerMetadata,
  CheckStatus,
  Severity
} from '../../types/checker.js';
import { Country, InputType, NormalizedInput } from '../../types/input.js';

type CarMatch = {
  carNumber: string;
  status: string | null;
  ownerDocument: string | null;
  ownerName: string | null;
  municipality: string | null;
  state: string | null;
};

function safeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export class IeIdentityBridgeChecker extends BaseChecker {
  readonly metadata: CheckerMetadata = {
    name: 'IE Identity Bridge',
    category: CheckerCategory.LEGAL,
    description: 'Tenta correlacionar Inscrição Estadual (IE) com identidade fiscal e possíveis vínculos CAR',
    priority: 7,
    supportedInputTypes: [InputType.IE],
    supportedCountries: [Country.BRAZIL]
  };

  readonly config: CheckerConfig = {
    enabled: true,
    cacheTTL: 86400,
    timeout: 20000
  };

  async executeCheck(input: NormalizedInput): Promise<CheckerResult> {
    const ie = input.value;
    let resolvedDocument: string | null = null;
    let resolvedDocumentType: string | null = null;
    let resolvedLegalName: string | null = null;
    let resolvedRegistrationStatus: string | null = null;
    let resolvedState: string | null = null;
    let resolvedMunicipality: string | null = null;

    const attempts: Array<Record<string, unknown>> = [
      {
        step: 'ie_to_document',
        status: 'PENDING',
        method: 'IE registry (SEFAZ/SINTEGRA ingestion)',
        message: 'Trying automatic IE resolution from local registry.'
      }
    ];

    let carMatchesByOwner: CarMatch[] = [];
    let carMatchesByCode: CarMatch[] = [];

    try {
      const ieQuery = await db.execute(sql`
        SELECT
          ie,
          state,
          document,
          document_type as "documentType",
          legal_name as "legalName",
          registration_status as "registrationStatus",
          municipality
        FROM ie_registry
        WHERE ie = ${ie}
        LIMIT 1
      `);

      const row = ieQuery.rows?.[0] as any;
      if (row) {
        resolvedDocument = safeString(row.document);
        resolvedDocumentType = safeString(row.documentType);
        resolvedLegalName = safeString(row.legalName);
        resolvedRegistrationStatus = safeString(row.registrationStatus);
        resolvedState = safeString(row.state);
        resolvedMunicipality = safeString(row.municipality);

        attempts[0] = {
          step: 'ie_to_document',
          status: resolvedDocument ? 'MATCH' : 'PARTIAL',
          method: 'IE registry (SEFAZ/SINTEGRA ingestion)',
          message: resolvedDocument
            ? 'IE resolved to identity document from local registry.'
            : 'IE found in registry without document field.',
          document: resolvedDocument,
          documentType: resolvedDocumentType
        };
      } else {
        attempts[0] = {
          step: 'ie_to_document',
          status: 'NO_MATCH',
          method: 'IE registry (SEFAZ/SINTEGRA ingestion)',
          message: 'IE not found in local registry. Manual UF lookup still required.'
        };
      }
    } catch (error) {
      attempts[0] = {
        step: 'ie_to_document',
        status: 'ERROR',
        method: 'IE registry (SEFAZ/SINTEGRA ingestion)',
        message: (error as Error).message
      };
    }

    try {
      const ownerQuery = await db.execute(sql`
        SELECT
          car_number as "carNumber",
          status,
          owner_document as "ownerDocument",
          owner_name as "ownerName",
          municipality,
          state
        FROM car_registrations
        WHERE owner_document = ${resolvedDocument || ie}
        LIMIT 10
      `);

      carMatchesByOwner = ownerQuery.rows.map((row: any) => ({
        carNumber: String(row.carNumber),
        status: safeString(row.status),
        ownerDocument: safeString(row.ownerDocument),
        ownerName: safeString(row.ownerName),
        municipality: safeString(row.municipality),
        state: safeString(row.state)
      }));

      attempts.push({
        step: 'car_lookup_by_owner_document',
        status: carMatchesByOwner.length > 0 ? 'MATCH' : 'NO_MATCH',
        matches: carMatchesByOwner.length,
        documentUsed: resolvedDocument || ie,
        message:
          carMatchesByOwner.length > 0
            ? 'Found CAR records where owner_document equals resolved identity.'
            : 'No CAR records matched resolved identity in owner_document.'
      });
    } catch (error) {
      attempts.push({
        step: 'car_lookup_by_owner_document',
        status: 'ERROR',
        message: (error as Error).message
      });
    }

    try {
      const codeQuery = await db.execute(sql`
        SELECT
          car_number as "carNumber",
          status,
          owner_document as "ownerDocument",
          owner_name as "ownerName",
          municipality,
          state
        FROM car_registrations
        WHERE car_number = ${ie}
        LIMIT 10
      `);

      carMatchesByCode = codeQuery.rows.map((row: any) => ({
        carNumber: String(row.carNumber),
        status: safeString(row.status),
        ownerDocument: safeString(row.ownerDocument),
        ownerName: safeString(row.ownerName),
        municipality: safeString(row.municipality),
        state: safeString(row.state)
      }));

      attempts.push({
        step: 'car_lookup_by_code',
        status: carMatchesByCode.length > 0 ? 'MATCH' : 'NO_MATCH',
        matches: carMatchesByCode.length,
        message:
          carMatchesByCode.length > 0
            ? 'Found CAR records with code pattern related to provided IE.'
            : 'No CAR code pattern matched provided IE.'
      });
    } catch (error) {
      attempts.push({
        step: 'car_lookup_by_code',
        status: 'ERROR',
        message: (error as Error).message
      });
    }

    const uniqueCarMatches = new Map<string, CarMatch>();
    for (const match of [...carMatchesByOwner, ...carMatchesByCode]) {
      uniqueCarMatches.set(match.carNumber, match);
    }
    const candidateCars = Array.from(uniqueCarMatches.values());

    attempts.push({
      step: 'coordinates_resolution',
      status: candidateCars.length > 0 ? 'POSSIBLE' : 'BLOCKED',
      method: 'CAR geometry centroid/intersection',
      message:
        candidateCars.length > 0
          ? 'Coordinates can be resolved if one candidate CAR is confirmed.'
          : 'Coordinates cannot be resolved from IE alone without confirmed CAR/document.'
    });

    const hasCandidates = candidateCars.length > 0;

    return {
      status: CheckStatus.WARNING,
      severity: hasCandidates ? Severity.LOW : Severity.MEDIUM,
      message: hasCandidates
        ? `IE requires confirmation step; found ${candidateCars.length} candidate CAR link(s).`
        : 'IE accepted, but direct property linkage requires extra resolution (SEFAZ/SINTEGRA and/or CAR/document).',
      details: {
        ie,
        bridgeType: 'IE_TO_IDENTITY_TO_CAR',
        resolution: {
          identity: {
            status: resolvedDocument ? 'RESOLVED' : 'NOT_RESOLVED',
            document: resolvedDocument,
            documentType: resolvedDocumentType,
            legalName: resolvedLegalName,
            registrationStatus: resolvedRegistrationStatus,
            state: resolvedState,
            municipality: resolvedMunicipality,
            note: resolvedDocument
              ? 'Identity resolved from IE registry.'
              : 'IE is state-level fiscal id; provide UF-backed data source or manual lookup.'
          },
          car: {
            status: hasCandidates ? 'CANDIDATE_FOUND' : 'NOT_FOUND',
            candidates: candidateCars
          },
          coordinates: {
            status: hasCandidates ? 'RESOLVABLE_AFTER_CONFIRMATION' : 'NOT_RESOLVED',
            note: hasCandidates
              ? 'Select/confirm a CAR candidate to derive geometry and run full spatial checks.'
              : 'Provide CAR number, CNPJ/CPF, address or coordinates to continue.'
          }
        },
        attempts,
        recommendedNextInputs: ['CNPJ', 'CPF', 'CAR', 'ADDRESS', 'COORDINATES']
      },
      evidence: {
        dataSource: 'SEFAZ/SINTEGRA (UF) + SICAR bridge strategy',
        url: 'https://www.car.gov.br/',
        lastUpdate: new Date().toISOString().slice(0, 10)
      },
      executionTimeMs: 0,
      cached: false
    };
  }
}

export default new IeIdentityBridgeChecker();
