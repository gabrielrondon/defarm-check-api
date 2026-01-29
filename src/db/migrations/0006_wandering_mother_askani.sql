CREATE TABLE "deter_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_date" date NOT NULL,
	"area_ha" integer NOT NULL,
	"state" varchar(2),
	"municipality" varchar(255),
	"classname" varchar(50),
	"sensor" varchar(20),
	"path_row" varchar(10),
	"source" varchar(20) DEFAULT 'DETER-B',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Adicionar coluna de geometria (PostGIS)
ALTER TABLE "deter_alerts" ADD COLUMN geometry geometry(MULTIPOLYGON, 4326);

-- Criar índice espacial GIST para queries rápidas
CREATE INDEX idx_deter_alerts_geometry ON "deter_alerts" USING GIST(geometry);

-- Criar índices adicionais
CREATE INDEX idx_deter_alerts_alert_date ON "deter_alerts"(alert_date);
CREATE INDEX idx_deter_alerts_state ON "deter_alerts"(state);
CREATE INDEX idx_deter_alerts_classname ON "deter_alerts"(classname);
