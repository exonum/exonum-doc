# Requests algorithm

The requests algorithm is used to obtain unknown information from nodes that
signal the presence of such information (for example, messages are sent from
heights greater than the current node height in the case of a lagging node).
The requests algorithm is an integral part of the consensus algorithm
(**TODO:** insert link to consensus algorithm).

## Assumptions and definitions

Receiving a message from the node gives us the opportunity to learn certain
information about the state of the node, if the node is not Byzantine:

**Any consensus message**

- The node is at the appropriate height, it has all the previous blocks, +2/3
_precommit_ for each of them.

**_Prevote_**

- The node has a corresponding proposal.
- The node has _all_ transactions of this proposal.
- If the node indicated `lock_round` in the message, it has a +2/3 _prevote_ for
this sentence in the specified round.

**_Precommit_**

- The node has a corresponding proposal.
- The node has _all_ transactions of this proposal.
- The node has +2/3 _prevote_ for this sentence in the corresponding round.

**_Connect_**

- On specified `addr` it is possible to address to a node with specified
`pub_key`.

## Sending query algorithm messages

**Getting any consensus message from a bigger height**

- Update the height for the corresponding node.
- Initiate sending _RequestBlock_ for the current height, if such a request was
not sent earlier.

**Receiving a transaction**

- If this is the last transaction required to generate some _propose_, node
deletes the data in the corresponding request and its timeouts.
- _According to the consensus algorithm_ a commit occurs, if all the necessary
conditions are met.

For any message from the current height:

**_propose_** **receiving**

- If the node requested this _propose_, it deletes the data about the request
and the timeout.
- If the node does not have certain transactions from this _propose_, it
initiates sending _RequestTransactions_.
- If there are committed transactions in _propose_, then discard them.
- A list of nodes that have all transactions should be copied from the remote
**RequestState** for _RequestPropose_, if it existed.
- _According to the consensus algorithm_, a commit occurs, if all the necessary
conditions are met.

**_prevote_** **receiving**

- If the node does not have a corresponding _propose_, it initiates sending
_RequestPropose_.
- If the node has _propose_ but not all transactions, it initiates sending
_RequestTransaction_.
- If the sender specified `lock_round`, which is greater than the stored PoL,
node initiates sending _RequestPrevotes_.
- If the node have formed +2/3 _prevote_, it deletes the data for the
corresponding request _RequestPrevotes_ and timeouts, if the node requested them
earlier.

**_precommit_** **receiving**

- If the node does not have a corresponding _propose_, it initiates sending
_RequestPropose_.
- If the node have _propose_ but not all transactions, it initiates sending
_RequestTransaction_.
- If the message corresponds to a larger round than the saved PoL, the node
initiates sending _RequestPrevotes_ for this round.
- If the node has formed +2/3 _precommit_, it deletes the data for the
corresponding request _RequestPrecommit_ and timeouts, if the node requested
them earlier.
- _According to the consensus algorithm_, a commit occurs, if all the necessary
conditions are met.

**_block_** **receiving**

- The node checks the correctness of all precommits so that they are correctly
signed, belong to the same propose and to the same round.
- The node checks the correctness of the transactions so that they are correctly
signed.
- The node executes transactions and makes sure that `block_hash` matches what
is specified in the block.
- The node commits the block if all conditions are met.
- The node requests the next block if there are validators at a height higher
than current.

**Adding new validators**

- Send the _RequestPeers_ request to the known network validator.

**Transition to a new height**

- Delete all information about requests and their timeouts.

**Request sending initiation**

- If there is no corresponding **RequestState** for the requested data, create
it and set the timer to wait for the data (`RequesTimeout`).
- Add the node to the list of nodes that have this data.

**Triggering request timeout**

- Delete the validator from the list of nodes that have the requested data.
- If the list of validators for which the requested data should be empty, delete
**RequestState**.
- Otherwise, execute the query and start a new timer.

## Message processing

The processing of responses to requests is trivial:

- If _to_ value does not correspond to our key, ignore the message.
- If the message is too old (the value of the field `time` is less than some
constant), ignore the message.
- If the message indicates the future time of delivery with an accuracy of some
`?`, ignore the message.
- Check the signature of the message.

_RequestPropose_

- If the message corresponds to a height higher than the one on which the node
is, ignore the message.
- If the node havs _propose_ c with the corresponding hash at the given height,
send it.

_RequestTransactions_

The node sends all transactions that we have from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool. If we does not have any requested transaction, it does not send anything.

_RequestPrevotes_

- If the message does not match the height at which the node is, ignore the
message.
- Send as individual messages all the corresponding _prevote_ messages except
those that the requestor has.

_RequestPrecommits_

- If the message corresponds to a height higher than the one on which the node
is, ignore the message.
- Send as individual messages all the corresponding _precommit_ messages except
those that the requestor has.

_RequestBlock_

- If the message corresponds to a height not less than the one on which we are,
ignore the message.
- Form the message `Block` from the data of the blockchain and send it to the
requestor.

_RequestPeers_

- Send all the saved messages _Connect_ from ** peers ** to the author.
