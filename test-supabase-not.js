const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const queueIds = ["00000000-0000-4000-8000-000000000000", "11111111-1111-4111-8111-111111111111"];
  const { data, error } = await supabase
        .from("line_queue_items")
        .select("id")
        .not("id", "in", `(${queueIds.join(",")})`);
  console.log("NOT IN string:", { error: error?.message, data });

  const { data: d2, error: e2 } = await supabase
        .from("line_queue_items")
        .select("id")
        .not("id", "in", `("${queueIds.join('","')}")`);
  console.log("NOT IN string with quotes:", { error: e2?.message, data: d2 });

  const { data: d3, error: e3 } = await supabase
        .from("line_queue_items")
        .select("id")
        .not("id", "in", queueIds); 
  console.log("NOT IN array (Supabase standard but wait .not doesn't accept array for 3rd arg in old supabase js?):", { error: e3?.message, data: d3 });
}
test();
