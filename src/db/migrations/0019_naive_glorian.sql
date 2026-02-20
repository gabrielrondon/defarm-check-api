CREATE TABLE "satellite_checker_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input_type" varchar(30) NOT NULL,
	"input_value" varchar(200) NOT NULL,
	"checker_name" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"severity" varchar(20),
	"message" text,
	"result_json" jsonb NOT NULL,
	"ttl_seconds" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Fast lookup: current result for a given input + checker
CREATE INDEX idx_satellite_results_lookup
  ON satellite_checker_results (input_value, checker_name, is_current);

-- Encontrar resultados expirados (para refresh jobs / monitoramento)
CREATE INDEX idx_satellite_results_expires
  ON satellite_checker_results (expires_at)
  WHERE is_current = true;

-- Histórico completo por input + checker (mais recente primeiro)
CREATE INDEX idx_satellite_results_history
  ON satellite_checker_results (input_value, checker_name, fetched_at DESC);
