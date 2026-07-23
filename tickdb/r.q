/ ============================================================
/ Finugreek Real-Time Database — r.q
/ Subscribes to tickerplant, holds today's ticks in-memory,
/ serves all analytics queries. Includes EOD flush logic.
/ Start: q r.q -p 5011
/ ============================================================

/ ── Configuration ───────────────────────────────────────────
TP_HOST:`localhost;
TP_PORT:5010i;
HDB_DIR:hsym `$":",string[system"cd"],"/tickdb/hdb";

/ ── Schema (must match tick.q) ──────────────────────────────
trade:([]
  time:`timestamp$();
  sym:`symbol$();
  price:`float$();
  size:`float$();
  side:`symbol$()
 );

quote:([]
  time:`timestamp$();
  sym:`symbol$();
  bid:`float$();
  ask:`float$();
  bsize:`float$();
  asize:`float$()
 );

depth:([]
  time:`timestamp$();
  sym:`symbol$();
  level:`int$();
  bid:`float$();
  ask:`float$();
  bsize:`float$();
  asize:`float$()
 );

/ ── Callback: tickerplant pushes data here ──────────────────
upd:{[t;x]
  t insert x;
 };

/ ── Subscribe to Tickerplant ────────────────────────────────
/ Tries to connect; if TP is not up yet, retries every 5s
.rdb.connect:{[]
  tp_addr:`$":",string[TP_HOST],":",string TP_PORT;
  r:@[hopen;tp_addr;{-1 "Cannot connect to Tickerplant: ",x; 0Ni}];
  if[null r;
    -1 "Retrying in 5 seconds...";
    .z.ts:{.rdb.connect[]; if[not null .rdb.tp_handle; system"t 0"]};
    system "t 5000";
    :();
  ];
  .rdb.tp_handle:r;
  / Subscribe to all tables, all syms
  res:r(`.u.sub;`;`);
  / Replay log if tickerplant sends it
  {[x] if[count x 1; upd[x 0;x 1]]} each res;
  -1 "Connected to Tickerplant on port ",string TP_PORT;
 };

.rdb.tp_handle:0Ni;
.rdb.connect[];

/ ============================================================
/ ANALYTICS FUNCTIONS
/ Called by backend via PyKX: conn("vwap", kx.SymbolAtom("BTCUSDT"))
/ ============================================================

/ ── VWAP ────────────────────────────────────────────────────
/ Volume-weighted average price for a symbol
vwap:{[s]
  t:select from trade where sym=s;
  if[0=count t; :(flip `sym`vwap`hi`lo`vol`ticks!(enlist s;0f;0f;0f;0f;0))];
  select sym, vwap:size wavg price,
         hi:max price, lo:min price,
         vol:sum size, ticks:count i
  from t
 };

/ ── OHLC Bar Aggregation ───────────────────────────────────
/ Aggregate trades into time bars
/ bar: duration in nanoseconds (e.g. 0D00:01 for 1 minute)
ohlcBars:{[s;bar]
  t:select from trade where sym=s;
  if[0=count t; :()];
  select o:first price, h:max price, l:min price,
         c:last price, v:sum size, vw:size wavg price,
         ticks:count i
  by bucket:bar xbar time
  from t
 };

/ Convenience wrappers
ohlc1m:{[s] ohlcBars[s;0D00:01]};
ohlc5m:{[s] ohlcBars[s;0D00:05]};
ohlc1h:{[s] ohlcBars[s;0D01:00]};

/ ── Order Book ──────────────────────────────────────────────
/ Get latest depth snapshot for a symbol
orderBook:{[s]
  d:select from depth where sym=s;
  if[0=count d;:()];
  / Get latest snapshot (latest time)
  lt:exec last time from d;
  select level, bid, ask, bsize, asize from d where time=lt
 };

/ Top of book: best bid/ask
topOfBook:{[s]
  q:select from quote where sym=s;
  if[0=count q; :(flip `bid`ask`bsize`asize`spread`mid!(enlist 0f;enlist 0f;enlist 0f;enlist 0f;enlist 0f;enlist 0f))];
  last select bid, ask, bsize, asize,
              spread:ask-bid,
              mid:0.5*ask+bid
  from q
 };

/ ── Order Book Imbalance ────────────────────────────────────
/ The core HFT signal: (bid_vol - ask_vol) / (bid_vol + ask_vol)
/ Values: +1 = all bids (strong buy), -1 = all asks (strong sell)
bookImbalance:{[s;n]
  d:orderBook[s];
  if[0=count d; :(flip `imbalance`spread`mid!(enlist 0f;enlist 0f;enlist 0f))];
  d:select from d where level<=n;
  bv:sum d`bsize;
  av:sum d`asize;
  tob:topOfBook[s];
  (flip `imbalance`spread`mid!(
    enlist $[0<bv+av;(bv-av)%bv+av;0f];
    enlist tob`spread;
    enlist tob`mid
  ))
 };

/ ── Rolling Statistics ──────────────────────────────────────
/ Rolling volatility: standard deviation of returns over window
rollVol:{[s;w]
  p:exec price from trade where sym=s;
  if[w>count p; :0f];
  r:1_ deltas[log p];          / log returns
  last w mdev r                / moving std dev
 };

/ Tick rate: trades per second over last N minutes
tickRate:{[s;m]
  cutoff:.z.p-(m*00:01:00);
  t:select from trade where sym=s, time>cutoff;
  n:count t;
  if[n<2; :0f];
  elapsed:(`float$(last[t`time]-first[t`time]))%1e9;  / seconds
  if[elapsed<=0; :0f];
  n%elapsed
 };

/ ── Recent Trades ───────────────────────────────────────────
recentTrades:{[s;n]
  neg[n] sublist select from trade where sym=s
 };

/ ── Summary Stats ───────────────────────────────────────────
/ Combined stats for the microstructure panel
allStats:{[s]
  v:vwap[s];
  tob:topOfBook[s];
  vol:rollVol[s;1000];
  rate:tickRate[s;5];
  imb:bookImbalance[s;10];
  (flip `vwap`high`low`volume`ticks`spread`mid`bid`ask`volatility`tick_rate`imbalance!(
    enlist first v`vwap;
    enlist first v`hi;
    enlist first v`lo;
    enlist first v`vol;
    enlist first v`ticks;
    enlist first tob`spread;
    enlist first tob`mid;
    enlist first tob`bid;
    enlist first tob`ask;
    enlist vol;
    enlist rate;
    enlist first imb`imbalance
  ))
 };

/ ── Active Symbols ──────────────────────────────────────────
activeSyms:{[] distinct exec sym from trade};

/ ============================================================
/ END-OF-DAY FLUSH
/ At midnight, persist in-memory data to HDB and clear tables
/ ============================================================

.eod.flush:{[]
  dt:.z.d - 1;  / yesterday's date (since midnight just passed)
  -1 "EOD flush starting for ",string dt;

  / Create date partition directory
  part:` sv HDB_DIR,`$string dt;
  system "mkdir -p ",1_string part;

  / Save each table as a splayed partition
  saveTo:{[dir;t]
    data:value t;
    if[0<count data;
      path:` sv dir,t;
      path set .Q.en[HDB_DIR;data];
      -1 "  Saved ",string[t],": ",string[count data]," rows";
    ];
  };

  saveTo[part;`trade];
  saveTo[part;`quote];
  saveTo[part;`depth];

  / Clear in-memory tables
  delete from `trade;
  delete from `quote;
  delete from `depth;

  -1 "EOD flush complete for ",string dt;
 };

/ Schedule EOD at midnight UTC (adjust if needed)
/ .z.ts checks every minute; fires flush at 00:00
/ Uncomment to enable automatic EOD:
/ .eod.lastFlush:.z.d;
/ .z.ts:{
/   if[.z.d>.eod.lastFlush;
/     .eod.flush[];
/     .eod.lastFlush:.z.d;
/   ];
/ };
/ system "t 60000";  / timer every 60s

/ ── Startup Message ─────────────────────────────────────────
-1 "=== Finugreek Real-Time Database ===";
-1 "Port: ",string system"p";
-1 "Tables: ",", " sv string tables[];
-1 "Analytics loaded: vwap, ohlcBars, orderBook, bookImbalance, rollVol, tickRate, recentTrades, allStats";
-1 "Ready for queries.";
