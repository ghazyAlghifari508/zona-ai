--> statement-breakpoint
UPDATE "model_settings" SET "status" = CASE WHEN "is_active" THEN 'active' ELSE 'inactive' END;