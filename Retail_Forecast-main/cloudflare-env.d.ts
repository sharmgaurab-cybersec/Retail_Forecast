declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SAVEHALF_ADMIN_EMAIL?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
