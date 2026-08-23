import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

export const taskStorage = config.supabaseUrl && config.supabaseServiceRoleKey
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, { auth: { persistSession: false } })
  : null;

export const taskStorageBucket = config.supabaseStorageBucket;
