CREATE TABLE "l3_trend_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "country" varchar(2) NOT NULL,
  "horizon_days" integer NOT NULL,
  "snapshot_date" date NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "checks_count" integer DEFAULT 0 NOT NULL,
  "avg_score" double precision,
  "non_compliant_rate" double precision,
  "trend_delta" double precision,
  "trend_label" varchar(20),
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "idx_l3_snapshots_country_horizon_date"
  ON "l3_trend_snapshots" ("country", "horizon_days", "snapshot_date");

CREATE INDEX "idx_l3_snapshots_country_generated_at"
  ON "l3_trend_snapshots" ("country", "generated_at");
