# Round Robin procedure

**Round Robin == RR**

## Solvable problem

The goal is to enrich the blockchain with following properties:
1. **Censorship resistance**
	Any correct transaction could be included into the new block somewhen.
2. **Liveness**
	New blocks would be generated and accepted even if some nodes behave unfairly
3. **Chain quality**
	Among any consecutive K blocks in an honest node’s chain, a sufficient fraction of the blocks are mined by honest miners.

Wherein Censorship Resistance (point 1) is ensured by Chain Quality (point 3).

## Round Robin overview

For the height H, some order over validators is introduced. The order defines node's `block proposal` priority , i.e. `block proposal` from node #1 would be accepted only if `block proposal` from node #1 absent. Round Robin algorithm defines such nodes order for each height H.
	
## Algorithm properties

The properties that are provided by the current algorithm:
1. *required* The algorithm should be common for all nodes. I.e. all nodes having actual assets-blockchain state should receive identical nodes order after executing Round Robin.
2. *required* The algorithm shoud essentially depend on a factors that are not under influence of some node (or some predefined nodes). For example, the correct algorithm should not depend on a prevblockhash, because such hash is directly defined by the leader from the previous height.
3. *desirable* Order of nodes (who is after someone) should differ from one height to another. That property eliminates possibility that bysantine nodes would state in blocks (multiple bysantine nodes one after another)

	
## Round Robin details

Let us have `F` bysantine validators, as well as `N = 3 * F + 1` validators in total. `H` is the current height for assets-blockchain.

1. Round Robin includes all validators except those that were authors for the block proposals on the previous `F` heights. That is, Round Robin on each height includes `M = N - F = 2 * F + 1` validators. Let re-enumerate them as `0, 1, ..., M - 1` according to their base numbers.
Such exclusion provides **censorship resistance** for Round Robin algorithm.
2. We take a transposition over these `M` validators. Number of transposition is calculated as `T = Hash(H) mod M!`
Such calculation provides uniform distribution of the orders, i.e. bysantine validators would be randomly distributed inside the current `H` height.


## Unsolved problems
The desired properties that are not provided by the current algorithm. It would be great if we could provide them somewhen:
1. *desired* The algorithm should not give preferences for any nodes (or artificially decrease priority for another nodes).
In our case, we give a preferences for nodes that less participated during last `F` blocks. Maybe such nodes do not give block proposals due to organic reasons (bad connection / server overloading / etc.)
2. *desired* Round Robin orders could be calculated strictly after the previous block accepted.
