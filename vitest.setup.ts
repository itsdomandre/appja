import "@testing-library/jest-dom/vitest";
import dotenv from "dotenv";

// Load local Supabase test credentials (see .env.test) so both route/integration
// and component tests can reach the local Supabase stack started via
// `npx supabase start` (see supabase/config.toml).
dotenv.config({ path: ".env.test" });
