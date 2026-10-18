-- Defense in depth: protect even an older deployment that does not yet check
-- revoked_identities in application code. No identities/data are modified here.
CREATE FUNCTION public.guard_deleted_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE identity_hash_value text;
BEGIN
  identity_hash_value := encode(sha256(
    convert_to('musmove-deleted-identity-v1', 'UTF8') || decode('00', 'hex') ||
    convert_to(NEW.issuer, 'UTF8') || decode('00', 'hex') || convert_to(NEW.subject, 'UTF8')
  ), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(identity_hash_value, 0));
  IF EXISTS (SELECT 1 FROM public.revoked_identities WHERE identity_hash=identity_hash_value AND expires_at>now()) THEN
    RAISE EXCEPTION USING ERRCODE='28000', MESSAGE='Deleted identity cannot be provisioned';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.guard_deleted_identity() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER users_revoked_identity_guard BEFORE INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_identity();
