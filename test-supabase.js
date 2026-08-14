const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.log("No Supabase env vars found.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: lines, error: lineError } = await supabase.from('production_lines').select('*').limit(1);
  if (lineError || !lines || lines.length === 0) {
    console.log("Could not fetch lines", lineError);
    return;
  }
  const lineId = lines[0].id;
  
  const testItem = {
    id: "00000000-0000-4000-8000-000000000000",
    line_id: lineId,
    order_index: 999,
    salad_id: "11111111-1111-4111-8111-111111111111",
    salad_name: "Test Salad",
    format_id: "22222222-2222-4222-8222-222222222222",
    box_type: "Cartón 4",
    quantity: 10,
    noblejas: 0,
    boxes_per_pallet: 4
  };

  const { data, error } = await supabase.from('line_queue_items').upsert([testItem], { onConflict: 'id' }).select();
  console.log("Upsert result UUID format:", { data, error });
  
  if (!error) {
    await supabase.from('line_queue_items').delete().eq('id', testItem.id);
  }

  // Now test with random string ID
  const testItemBad = {
    ...testItem,
    id: "testbad123",
    salad_id: "salad123",
    format_id: "format123"
  };

  const { data: data2, error: error2 } = await supabase.from('line_queue_items').upsert([testItemBad], { onConflict: 'id' }).select();
  console.log("Upsert result bad string format:", { data2, error2 });
}
test();
