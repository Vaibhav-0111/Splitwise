const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Read .env file manually
const envPath = path.resolve(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let val = match[2] || "";
    // Remove wrapping quotes if any
    if (val.length > 0 && val.charAt(0) === '"' && val.charAt(val.length - 1) === '"') {
      val = val.substring(1, val.length - 1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Anon Key length:", supabaseAnonKey?.length);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runTest() {
  try {
    // 1. Try to query profiles
    console.log("Querying profiles table...");
    const { data: profiles, error: selectError } = await supabase
      .from("profiles")
      .select("*")
      .limit(5);

    if (selectError) {
      console.error("Select error:", selectError);
    } else {
      console.log("Select success! Profiles:", profiles);
    }

    // 2. Try to insert a test profile
    const testId = "00000000-0000-0000-0000-000000000000";
    console.log("Attempting to upsert a test profile...");
    const { data: insertData, error: insertError } = await supabase
      .from("profiles")
      .upsert({
        id: testId,
        email: "test-anon@example.com",
        display_name: "Test Anon User",
        created_at: new Date().toISOString()
      });

    if (insertError) {
      console.error("Upsert error:", insertError);
    } else {
      console.log("Upsert success!");
      
      // Clean up
      console.log("Cleaning up test profile...");
      const { error: deleteError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", testId);
      
      if (deleteError) {
        console.error("Delete error:", deleteError);
      } else {
        console.log("Delete cleanup success!");
      }
    }
  } catch (err) {
    console.error("Catastrophic error:", err);
  }
}

runTest();
