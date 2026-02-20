CREATE TABLE "repsal_sanciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuit" varchar(11) NOT NULL,
	"razon_social" text NOT NULL,
	"provincia" varchar(100),
	"localidad" varchar(100),
	"actividad" varchar(255),
	"tipo_infraccion" text,
	"empleados_registrados" integer,
	"organismo_sancionador" varchar(255),
	"organismo_publicador" varchar(255),
	"fecha_ingreso" varchar(30),
	"fin_publicacion" varchar(30),
	"numero_expediente" varchar(100),
	"country" varchar(2) DEFAULT 'AR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
