# Round Robin procedure  

**Round Robin == RR**

## Solvable problem

The goal is to enrich the blockchain with following properties:  

1. **Censorship resistance**  
	Any correct transaction broadcasted to every validator would be included into the new block somewhen.  
2. **Liveness**  
	New blocks would be generated and accepted even if some nodes behaved unfairly.  
3. **Chain quality**  
	Among any consecutive `K` blocks in an honest node’s chain, a sufficient fraction of the blocks is mined by honest miners.  

*Wherein Censorship Resistance (point 1) is ensured by Chain Quality (point 3).*  
*The current solution guarantees only weak form of chain quality: only `1 block out of F+1 blocks` is guaranteed to be mined by honest miners (instead of `sufficient fraction of K blocks`).*  

## Round Robin overview

Round Robin algorithm defines how the order of validating nodes for the height `H` should be calculated. Such order determines node's `block proposal` priority. That is, block proposal from node #2 would be accepted only if `block proposal` from node #1 was absent.  
	
## Algorithm properties

The properties that are provided by the current algorithm:  

1. *required* The algorithm should be common for all nodes, that is, all nodes having actual assets-blockchain state should receive identical nodes order after executing Round Robin.  
2. *required* The algorithm should essentially depend on factors that are not under the influence of some node (or some predefined nodes). For example, the correct algorithm should not depend on a `prevblockhash`, because such hash is directly defined by the leader node from the previous height.  
3. *desirable* Order of nodes should differ from one height to another. Due to this property, byzantine nodes would not follow one after the other in a series but would be randomly interspersed with fair nodes.  

	
## Round Robin details

Let us have `F` byzantine validators, as well as `N = 3 * F + 1` validators in total. `H` is the current height for assets-blockchain.  

1. Round Robin includes all validators except those that were authors of the block proposals on the previous `F` heights. That is, Round Robin on each height includes `M = N - F = 2 * F + 1` validators. Let us re-enumerate them as `0, 1, ..., M - 1` according to their base numbers.  
Such exclusion provides **censorship resistance** for Round Robin algorithm.  
2. We take a transposition over these `M` validators. The number of transposition is calculated as `T = Hash(H) mod M!`  
Such calculation provides uniform distribution of the orders, that is byzantine validators would be randomly distributed inside the current `H` height.  


## Unsolved problems
The desired properties that are not provided by the current algorithm. It would be great if we could provide them somewhen:  

1. *desired* The algorithm should not give preferences for any nodes (or artificially decrease priority for other nodes).  
In our case, we give preferences for nodes that were less involved in last `F` blocks. Perhaps such nodes do not give block proposals due to objective reasons: bad connection, server overloading, etc.  
2. *desired* Round Robin orders could be calculated strictly after the previous block was accepted.  
