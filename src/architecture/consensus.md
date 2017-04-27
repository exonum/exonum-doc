# Consensus in Exonum

This consensus algorithm is based on the [algorithm proposed in Tendermint][tendermint_consensus].

## Assumptions and definitions

- Hereinafter, we will call the **consensus algorithm** the process of obtaining an agreed result by a group of participants. In this system the consensus algorithm is used to obtain the next block, which will be added to the blockchain.
- It is assumed that not all the nodes of the blockchain network are involved in the consensus algorithm, but only the specialized validating nodes (validators) authorized by the blockchain (they are either written in the genesis block or selected by other validators). The code that runs on all the validators is identical. There are no selected nodes. (**TODO:** doublecheck last sentence)
- It is assumed that the processors of the validators are partially synchronous (difference in their performances does not exceed an unknown and finite number `F` times) and the network is partially synchronous. (time for message delivery does not exceed the unknown time `t`)
- Each validator uses its own **stopwatch** to determine the time.
- The process of reaching consensus on the next block (at the height `H`) consists of several **rounds**, numbered from 1\. The stopwatch starts counting from zero once the validator moves to a new height `H`. The onset of the next round is determined by a fixed timetable: rounds start after regular intervals. In each round a leader node is chosen. Leader node offers the next block. The logic of selecting the leader node is described in the separate algorithm. (**TODO:** insert link to leader election algorithm)
- When the round `R` comes, the previous rounds are not completed: round `R` for the validator means that validator can process messages related to a round with a number no greater than `R`.
- We will call the current state of the network node `(H, R)`, meaning the height `H` and the round `R` of negotiations for the next block acceptance.
- Network nodes exchange messages. The consensus algorithm uses several types of messages (for a detailed description, see [below](consensus.md#data-transfer-protocol)):

  1. _Propose_ - a set of transactions to include in the block. If the behavior is correct, it is sent only by the leader node of the round.
  2. _Prevote_ - voting message, indicating that the node has a correctly formed offer and all the transactions specified in it. To be distributed by all nodes.
  3. _Precommit_ - message expressing readiness to accept the next block. To be distributed by all nodes.
  4. _Status_ - information message about the current height. It is sent with a periodicity written in the `status_timeout` variable.
  5. _Block_ - message containing a block and a set of _precommit_ messages that allowed that block to be accepted. To be sent on request.
  6. _Request_ - request message for receiving certain information. Such requests are sent to receive unknown information to nodes that signal its presence (for example, messages are sent from heights greater than the current node height - the case of a lagging node). Sending and processing of such messages is algorithmized (**TODO:** insert link to request algorithm). The algorithm for sending requests is an integral part of the consensus algorithm.

- +2/3 means "more than 2/3", and -1/3 means less than one third.

- A set of +2/3 votes from _prevote_ state `(H, R)` will be called _Proof-of-Lock_ (_PoL_). Nodes can store PoL. The node can have no more than one stored PoL.

- We will say that PoL is more then recorded one (has a higher priority), in cases when 1) there is no PoL recorded 2) the recorded PoL corresponds to a proposal with a smaller round number.

- Some ordered numbering of validators (validator id) from 0 to N-1 exists and it is known to all network members. When moving to a new height, the validator number may change due to a change in the list of validator nodes.

- Nodes receive and exchange among themselves transactions that need to be added to the blockchain. Each node has a list of transactions that have not yet been added to the blockchain. This list will be called **pool of unconfirmed transactions** . In general, the pools of unconfirmed transactions are different for different nodes. If necessary, the nodes can request unknown transactions from other nodes. We will also refer to the transaction added to the blockchain in one of the previous blocks as **committed**.

- When creating a proposal, the node selects from the pool no more than a certain number of transactions. This is done in order not to create too large blocks.

## Node states overview

## Example of algorithm operation

## Data transfer protocol

## Messages

## Algorithm operation

## Optimization

## Proof of algorithm correctness

[tendermint_consensus]: https://github.com/tendermint/tendermint/wiki/Byzantine-Consensus-Algorithm
