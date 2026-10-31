/**
 * In-memory stand-in for the slice of supabase-js the app uses: a PostgREST
 * style query builder over plain tables plus `auth`. Not a test file itself.
 *
 *   const fake = createFakeSupabase({ session });
 *   fake.tables.runs        // rows as stored
 *   fake.fail('runs', 'upsert', 'offline')   // next matching call errors
 *   fake.emit('SIGNED_IN', session)          // drive onAuthStateChange
 */

const EMBED = /(\w+)\(([^)]*)\)/g;

function columnsOf(select) {
  return select
    .replace(EMBED, '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function pick(row, columns) {
  if (!columns.length || columns.includes('*')) return { ...row };
  return Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
}

export function createFakeSupabase({ session = null, rls = true } = {}) {
  const tables = { runs: [], run_answers: [], profiles: [] };
  const failures = [];
  const calls = [];
  const authListeners = new Set();
  let current = session;

  function takeFailure(table, op) {
    const i = failures.findIndex((f) => f.table === table && f.op === op);
    return i === -1 ? null : failures.splice(i, 1)[0];
  }

  function visible(table) {
    const rows = tables[table];
    if (!rls) return rows;
    const uid = current?.user?.id;
    if (!uid) return [];
    return rows.filter((r) => (table === 'profiles' ? r.id === uid : r.user_id === uid));
  }

  function embed(table, row, select) {
    const out = pick(row, columnsOf(select));
    for (const [, child, cols] of select.matchAll(EMBED)) {
      if (table === 'runs' && child === 'run_answers') {
        const columns = cols.split(',').map((c) => c.trim());
        out.run_answers = visible('run_answers')
          .filter((a) => a.run_id === row.id)
          .map((a) => pick(a, columns));
      }
    }
    return out;
  }

  function from(table) {
    const state = { op: 'select', select: '*', filters: [], order: null, limit: null, single: null };
    let payload = null;
    let options = {};

    function matches(row) {
      return state.filters.every(([, col, value]) => row[col] === value);
    }

    function execute() {
      calls.push({ table, op: state.op, filters: state.filters.slice(), payload, options });
      const failure = takeFailure(table, state.op);
      if (failure) return { data: null, error: { message: failure.message } };
      const uid = current?.user?.id;
      let result;
      if (state.op === 'upsert') {
        const key = (options.onConflict ?? 'id').split(',');
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          if (rls && row.user_id !== uid) return { data: null, error: { message: 'new row violates row-level security policy' } };
          const at = tables[table].findIndex((r) => key.every((k) => r[k] === row[k]));
          if (at !== -1 && rls && tables[table][at].user_id !== uid) {
            return { data: null, error: { message: 'new row violates row-level security policy' } };
          }
          if (at === -1) tables[table].push({ ...row });
          else tables[table][at] = { ...tables[table][at], ...row };
        }
        result = state.selectAfter ? rows : null;
      } else if (state.op === 'update') {
        const hit = visible(table).filter(matches);
        hit.forEach((row) => Object.assign(row, payload));
        result = hit.map((row) => embed(table, row, state.select));
      } else if (state.op === 'delete') {
        const hit = new Set(visible(table).filter(matches));
        tables[table] = tables[table].filter((r) => !hit.has(r));
        if (table === 'runs') {
          const ids = new Set([...hit].map((r) => r.id));
          tables.run_answers = tables.run_answers.filter((a) => !ids.has(a.run_id));
        }
        result = null;
      } else {
        let rows = visible(table).filter(matches);
        if (state.order) {
          const { col, ascending } = state.order;
          rows = rows.slice().sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1));
        }
        if (state.limit !== null) rows = rows.slice(0, state.limit);
        result = rows.map((row) => embed(table, row, state.select));
      }
      if (state.single && Array.isArray(result)) {
        if (result.length > 1) return { data: null, error: { message: 'multiple rows' } };
        if (!result.length && state.single === 'single') return { data: null, error: { message: 'no rows' } };
        result = result[0] ?? null;
      }
      return { data: result, error: null };
    }

    const builder = {
      select(columns = '*') {
        state.select = columns;
        if (state.op !== 'select') state.selectAfter = true;
        return builder;
      },
      eq(col, value) {
        state.filters.push(['eq', col, value]);
        return builder;
      },

      order(col, { ascending = true } = {}) {
        state.order = { col, ascending };
        return builder;
      },
      limit(n) {
        state.limit = n;
        return builder;
      },
      maybeSingle() {
        state.single = 'maybe';
        return builder;
      },
      single() {
        state.single = 'single';
        return builder;
      },
      upsert(rows, opts = {}) {
        state.op = 'upsert';
        payload = rows;
        options = opts;
        return builder;
      },
      update(values) {
        state.op = 'update';
        payload = values;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      then(resolve, reject) {
        return Promise.resolve().then(execute).then(resolve, reject);
      },
    };
    return builder;
  }

  function emit(event, next) {
    if (event !== 'INITIAL_SESSION') current = next; // that one only reports state
    authListeners.forEach((listener) => listener(event, next));
  }

  const auth = {
    calls: [],
    async getSession() {
      auth.calls.push(['getSession']);
      const failure = takeFailure('auth', 'session');
      // Like supabase-js when an expired session cannot be refreshed offline.
      if (failure) return { data: { session: null }, error: { name: 'AuthRetryableFetchError', message: failure.message } };
      return { data: { session: current }, error: null };
    },
    onAuthStateChange(listener) {
      authListeners.add(listener);
      return { data: { subscription: { unsubscribe: () => authListeners.delete(listener) } } };
    },
    async signInWithOtp(args) {
      auth.calls.push(['signInWithOtp', args]);
      const failure = takeFailure('auth', 'otp');
      return { data: {}, error: failure ? { message: failure.message } : null };
    },
    async signInWithOAuth(args) {
      auth.calls.push(['signInWithOAuth', args]);
      return { data: { url: 'https://accounts.example/oauth?x=1', provider: args.provider }, error: null };
    },
    async exchangeCodeForSession(code) {
      auth.calls.push(['exchangeCodeForSession', code]);
      const failure = takeFailure('auth', 'exchange');
      if (failure) return { data: null, error: { message: failure.message } };
      const next = { user: { id: `user-${code}`, email: `${code}@example.com` } };
      emit('SIGNED_IN', next);
      return { data: { session: next }, error: null };
    },
    async signOut(options) {
      auth.calls.push(options ? ['signOut', options] : ['signOut']);
      emit('SIGNED_OUT', null);
      return { error: null };
    },
  };

  /** The account RPCs (accept_terms, delete_my_account), run as the signed-in user. */
  async function rpc(name, args = {}) {
    calls.push({ rpc: name, args });
    const failure = takeFailure('rpc', name);
    if (failure) return { data: null, error: { message: failure.message } };
    const uid = current?.user?.id;
    if (!uid) return { data: null, error: { message: 'not signed in', code: '42501' } };
    if (name === 'accept_terms') {
      const profile = tables.profiles.find((p) => p.id === uid);
      if (profile) Object.assign(profile, { terms_version: args.p_version, terms_accepted_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (name === 'delete_my_account') {
      const runIds = new Set(tables.runs.filter((r) => r.user_id === uid).map((r) => r.id));
      tables.profiles = tables.profiles.filter((p) => p.id !== uid);
      tables.runs = tables.runs.filter((r) => r.user_id !== uid);
      tables.run_answers = tables.run_answers.filter((a) => !runIds.has(a.run_id));
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unknown function ${name}` } };
  }

  return {
    from,
    rpc,
    auth,
    tables,
    calls,
    emit,
    fail(table, op, message = 'boom') {
      failures.push({ table, op, message });
    },
  };
}

/** Wait for queued promise callbacks and timers (background sync). */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

export function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}
