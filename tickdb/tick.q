/ ============================================================
/ Finugreek Tickerplant — tick.q
/ Canonical tick architecture: receives, logs, publishes.
/ Start: q tick.q -p 5010
/ ============================================================

/ ── Schema ──────────────────────────────────────────────────
/ Define empty typed tables that match what feed.py publishes.

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

/ ── Pub/Sub Namespace ───────────────────────────────────────
\d .u

/ Subscriber list: (handle; tableName; symList)
sub_list:flip `handle`tab`syms!(`int$();`symbol$();());

/ Log file handle
logHandle:0Ni;

/ Initialize logging
init:{[]
  dir:hsym `$(system"cd"),"/logs";
  logfile:` sv dir,`$string[.z.d],".log";
  .u.logHandle:hopen logfile;
  -1 "Tickerplant initialized. Log: ",string logfile;
 };

/ Subscribe: called by RDB on connect
/ Returns (tableName; schema) so subscriber knows the schema
sub:{[t;s]
  `.u.sub_list insert (.z.w;t;s);
  r:$[t=`;tables[];enlist t];
  {(x;value x)} each r
 };

/ Publish to all subscribers
pub:{[t;x]
  {[t;x;row]
    if[(row[`tab]=t) or row[`tab]=`;
      neg[row`handle] (`upd;t;x)
    ];
  }[t;x;] each .u.sub_list;
 };

/ Receive an update from the feed handler
/ Logs to disk, then publishes to subscribers
upd:{[t;x]
  / Timestamp if not already set
  ts:.z.p;
  if[99h=type x;x:enlist x];
  if[98h<>type x;
    x:flip (cols value t)!enlist each x;
  ];
  / Update time column to now if it contains null timestamps
  if[any null x`time; x:update time:ts from x];
  / Log to disk (append)
  .u.logHandle enlist (`upd;t;x);
  / Publish to subscribers
  .u.pub[t;x];
  / Also insert into local copy for monitoring
  t insert x;
 };

\d .

/ ── Initialization ──────────────────────────────────────────
.u.init[];

/ ── Connection Handlers ─────────────────────────────────────
/ When a subscriber disconnects, remove from list
.z.pc:{[h]
  .u.sub_list::select from .u.sub_list where handle<>h;
  -1 "Client disconnected: ",string h;
 };

/ When a new client connects
.z.po:{[h]
  -1 "Client connected: ",string h;
 };

/ ── Startup Message ─────────────────────────────────────────
-1 "=== Finugreek Tickerplant ===";
-1 "Port: ",string system"p";
-1 "Tables: ",", " sv string tables[];
-1 "Waiting for connections...";
