import { supabase } from '@/lib/supabase';

// Maps a PayPRO entity call-site name (unchanged from the legacy SDK) to its
// Supabase table. Import-path swap only for any future page/component port
// off PayPRO — call sites keep using `Employee.list()`, `PayStub.create()`, etc.
const TABLE_MAP = {
  Employee: 'PayPro_Employee',
  PayStub: 'PayPro_PayStub',
  Remittance: 'PayPro_Remittance',
  EmployeeDeduction: 'PayPro_EmployeeDeduction',
  EmployeePayType: 'PayPro_EmployeePayType',
  EmployeeFile: 'PayPro_EmployeeFile',
  TrainingRecord: 'PayPro_TrainingRecord',
  ValidPayType: 'PayPro_ValidPayType',
  TaxYearConstant: 'PayPro_TaxYearConstant',
  PayrollSetting: 'PayPro_PayrollSetting',
};

// PostgREST's db-max-rows cap (10,000 on this project) truncates any single
// request silently, independent of an unbounded client-side call. Page
// through with .range() on every list/filter, even though today's row
// counts (<=112) don't need it yet - a future bulk re-import could grow one
// of these tables past the cap.
const PAGE_SIZE = 1000;

function generateId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 24);
}

// Same current-session lookup convention already used across the app
// (Layout.jsx's TimeRecord insert, Customers.jsx, DocumentEditor.jsx, etc.):
// created_by = Employee.email, created_by_id = Employee.autopro_user_id.
// Cached for the module's lifetime since the signed-in user can't change
// without a full page reload.
let cachedForAuthUserId = null;
let cachedCreatorInfo = null;

async function getCreatorInfo() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { created_by: null, created_by_id: null };

  if (cachedForAuthUserId === user.id && cachedCreatorInfo) {
    return cachedCreatorInfo;
  }

  const { data: employee, error } = await supabase
    .from('Employee')
    .select('autopro_user_id, email')
    .eq('mykadr_user_id', user.id)
    .maybeSingle();
  if (error) console.error('payrollEntities: creator lookup failed', error);

  cachedForAuthUserId = user.id;
  cachedCreatorInfo = {
    created_by: employee?.email ?? user.email ?? null,
    created_by_id: employee?.autopro_user_id ?? null,
  };
  return cachedCreatorInfo;
}

// buildQuery must return a fresh, unconsumed query builder each call -
// a supabase-js query builder can't be re-ranged once awaited.
async function fetchAllRows(buildQuery) {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function applySort(query, sortString) {
  if (!sortString) {
    // .range()-based pagination needs a stable order across requests -
    // Postgres makes no ordering guarantee without an explicit ORDER BY.
    return query.order('id', { ascending: true });
  }
  const descending = sortString.startsWith('-');
  const column = descending ? sortString.slice(1) : sortString;
  return query.order(column, { ascending: !descending });
}

function makeEntity(tableName) {
  return {
    async list(sortString) {
      return fetchAllRows(() => applySort(supabase.from(tableName).select('*'), sortString));
    },

    async filter(queryObject = {}) {
      return fetchAllRows(() => {
        let query = supabase.from(tableName).select('*');
        for (const [column, value] of Object.entries(queryObject)) {
          // Mongo-style { '$in': [...] } (BatchPaychequeProcessor's multi-employee
          // YTD lookup) needs .in(), not .eq() against a JSON object - the latter
          // matches zero rows silently instead of throwing. Every other call site
          // passes a plain value and is unaffected.
          if (value && typeof value === 'object' && '$in' in value) {
            query = query.in(column, value['$in']);
          } else {
            query = query.eq(column, value);
          }
        }
        return applySort(query, null);
      });
    },

    async get(id) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(data) {
      const creator = await getCreatorInfo();
      const payload = {
        ...data,
        id: generateId(),
        created_date: new Date().toISOString(),
        created_by: creator.created_by,
        created_by_id: creator.created_by_id,
      };
      const { data: row, error } = await supabase.from(tableName).insert(payload).select().single();
      if (error) throw error;
      return row;
    },

    async update(id, data) {
      // No updated_by/updated_by_id column exists on any of these 10 tables - don't invent one.
      const payload = { ...data, updated_date: new Date().toISOString() };
      const { data: row, error } = await supabase.from(tableName).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return row;
    },

    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async bulkCreate(arrayOfData) {
      const creator = await getCreatorInfo();
      const createdDate = new Date().toISOString();
      const payload = arrayOfData.map((row) => ({
        ...row,
        id: generateId(),
        created_date: createdDate,
        created_by: creator.created_by,
        created_by_id: creator.created_by_id,
      }));
      const { data: rows, error } = await supabase.from(tableName).insert(payload).select();
      if (error) throw error;
      return rows;
    },
  };
}

export const Employee = makeEntity(TABLE_MAP.Employee);
export const PayStub = makeEntity(TABLE_MAP.PayStub);
export const Remittance = makeEntity(TABLE_MAP.Remittance);
export const EmployeeDeduction = makeEntity(TABLE_MAP.EmployeeDeduction);
export const EmployeePayType = makeEntity(TABLE_MAP.EmployeePayType);
export const EmployeeFile = makeEntity(TABLE_MAP.EmployeeFile);
export const TrainingRecord = makeEntity(TABLE_MAP.TrainingRecord);
export const ValidPayType = makeEntity(TABLE_MAP.ValidPayType);
export const TaxYearConstant = makeEntity(TABLE_MAP.TaxYearConstant);
export const PayrollSetting = makeEntity(TABLE_MAP.PayrollSetting);
