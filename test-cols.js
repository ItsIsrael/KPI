const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function test() {
  const { data, error } = await supabase
    .from('line_queue_items')
    .select('*')
    .limit(1);
  console.log({ data, error });
  if (data && data.length > 0) {
    console.log("Keys:", Object.keys(data[0]));
  }
}
test();
