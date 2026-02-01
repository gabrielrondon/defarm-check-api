CREATE TABLE "ana_outorgas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"int_cd" varchar(50),
	"numero_processo" varchar(100),
	"codigo_cnarh" varchar(50),
	"nome_requerente" varchar(500),
	"municipio" varchar(255),
	"uf" varchar(2),
	"corpo_hidrico" varchar(255),
	"regiao_hidrografica" varchar(255),
	"finalidade_principal" varchar(100),
	"tipo_interferencia" varchar(100),
	"resolucao" varchar(100),
	"data_publicacao" date,
	"data_vencimento" date,
	"categoria" varchar(50),
	"volume_anual_m3" integer,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Add PostGIS geometry column for point location
ALTER TABLE ana_outorgas ADD COLUMN geom geometry(POINT, 4326);

-- Create indexes
CREATE INDEX idx_ana_outorgas_codigo_cnarh ON ana_outorgas (codigo_cnarh);
CREATE INDEX idx_ana_outorgas_uf ON ana_outorgas (uf);
CREATE INDEX idx_ana_outorgas_categoria ON ana_outorgas (categoria);
CREATE INDEX idx_ana_outorgas_data_vencimento ON ana_outorgas (data_vencimento);
CREATE INDEX idx_ana_outorgas_finalidade ON ana_outorgas (finalidade_principal);
CREATE INDEX idx_ana_outorgas_geom ON ana_outorgas USING GIST (geom);
