Workbench scoreboard (mean ± standard error over seeds; "vs base" = paired difference in VERIFIED against baseline-fixed)

case baseline-e0-corrected [c98124f9b768]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 143.2±5.2 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 1357±5 | 186±9
baseline-random | 117.8±3.4 | -25.3±5.9 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1382±3 | 175±4
claude-h1 | 250.5±3.3 | 107.3±7.2 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1250±3 | 440±12
claude-h1b | 241.3±3.6 | 98.2±7.1 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1259±4 | 264±7
codex-c1 | 261.2±3.4 | 118.0±5.3 | 1.00±0.00 | 0.0±0.0 | 0±0 | 1239±3 | 900±19

case claude-churn-and-noise [8582c3c08ae4]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 150.5±4.7 | — | 0.93±0.01 | 149.7±4.8 | 432±5 | 1350±5 | 193±4
baseline-random | 99.3±4.4 | -51.2±3.0 | 0.93±0.00 | 76.3±5.4 | 527±3 | 1401±4 | 178±3
claude-h1 | 151.8±7.9 | 1.3±3.8 | 0.93±0.01 | 178.8±8.3 | 411±5 | 1348±8 | 321±10
claude-h1b | 136.7±3.8 | -13.8±2.2 | 0.96±0.00 | 146.8±6.6 | 439±8 | 1363±4 | 232±2
codex-c1 | 178.3±4.9 | 27.8±1.2 | 0.94±0.01 | 172.5±7.4 | 419±6 | 1322±5 | 639±20

case claude-enumerable-source [de43aff224cc]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 340.2±8.0 | — | 1.00±0.00 | 0.0±0.0 | 0±0 | 660±8 | 140±5
baseline-random | 219.0±6.9 | -121.2±5.8 | 1.00±0.00 | 0.0±0.0 | 0±0 | 781±7 | 113±4
claude-h1 | 413.0±7.6 | 72.8±4.7 | 1.00±0.00 | 0.0±0.0 | 0±0 | 587±8 | 201±4
claude-h1b | 403.8±8.7 | 63.7±4.8 | 1.00±0.00 | 0.0±0.0 | 0±0 | 596±9 | 155±4
codex-c1 | 395.2±9.1 | 55.0±6.4 | 1.00±0.00 | 0.0±0.0 | 0±0 | 605±9 | 474±7

case claude-unlearnable-decoy [73f0cc5c2cb7]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 55.7±2.7 | — | 0.23±0.01 | 84.7±3.9 | 305±5 | 1144±3 | 168±4
baseline-random | 43.8±2.3 | -11.8±2.4 | 0.23±0.01 | 54.2±3.9 | 359±4 | 1156±2 | 147±2
claude-h1 | 36.8±5.3 | -18.8±5.0 | 0.18±0.02 | 53.3±8.7 | 374±13 | 1163±5 | 271±6
claude-h1b | 40.7±5.3 | -15.0±2.8 | 0.17±0.02 | 63.5±10.4 | 349±10 | 1159±5 | 190±5
codex-c1 | 83.5±4.2 | 27.8±1.9 | 0.22±0.01 | 145.0±6.9 | 273±8 | 1117±4 | 659±4

case claude-weak-cues-cycles [15d8c252a90d]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 108.7±2.5 | — | 1.00±0.00 | 415.7±7.4 | 372±10 | 1391±3 | 193±6
baseline-random | 54.7±1.9 | -54.0±3.0 | 1.00±0.00 | 145.7±10.1 | 573±12 | 1445±2 | 187±3
claude-h1 | 58.7±1.1 | -50.0±2.1 | 1.00±0.00 | 260.7±10.0 | 423±10 | 1441±1 | 337±5
claude-h1b | 92.5±1.7 | -16.2±1.9 | 1.00±0.00 | 378.8±7.3 | 351±4 | 1408±2 | 228±5
codex-c1 | 111.7±2.4 | 3.0±1.7 | 1.00±0.00 | 418.2±8.3 | 390±5 | 1388±2 | 498±16

case codex-alias-storm [1ca151bfb078]
mechanism | verified | vs base | precision | reopens found | reopen delay | wasted | cpu ms
baseline-fixed | 122.0±2.9 | — | 1.00±0.00 | 1113.8±70.0 | 300±6 | 1078±3 | 156±3
baseline-random | 103.7±3.3 | -18.3±2.1 | 1.00±0.00 | 785.0±43.6 | 345±10 | 1096±3 | 141±5
claude-h1 | 110.3±4.1 | -11.7±2.3 | 1.00±0.00 | 1339.3±62.8 | 165±10 | 1090±4 | 255±4
claude-h1b | 111.3±2.8 | -10.7±0.7 | 1.00±0.00 | 1175.3±64.5 | 230±11 | 1089±3 | 185±5
codex-c1 | 124.5±2.6 | 2.5±0.8 | 1.00±0.00 | 1301.8±61.8 | 261±5 | 1071±3 | 407±9

