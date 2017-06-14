# Requests in Consensus Algorithm

The requests algorithm is used to obtain unknown information from nodes that
signal the presence of such information (for example, by messages sent from
heights greater than the current node height in the case of a lagging node). The
requests algorithm is an integral part of the [consensus algorithm](consensus.md).

## Assumptions and Definitions

!!! note
    In the following description, +2/3 means more than two thirds of the
    validators number.

Receiving a consensus message from a node gives the message recepient
an opportunity to learn certain
information about the state of the message author, if the author is not Byzantine.

### Any Consensus Message

- The message author is at the height implied by the message
- The author has all previous blocks
- The author has +2/3 `Precommit` messages for each of previous blocks

### `Prevote`

- The author has a proposal (`Propose` message) referenced by the `Prevote` message
- The author has all transactions mentioned in this proposal
- If the author indicated `lock_round` in the message, it has a +2/3 `Prevote`
  messages for this proposal in the specified round

### `Precommit`

- The author has a proposal referenced by the `Precommit` message
- The author has all transactions mentioned in this proposal
- The author has +2/3 `Prevote` messages for this proposal in the corresponding
  round

### `Connect`

- It is possible to access the author by using the IP adress + port
  mentioned in the message

## Algorithm for Sending Requests

This algorithm determines the node's behavior at different stages of the
consensus algorithm if the node needs to request information from other nodes.
The following subsections describe events that cause a specific response.

For each sent request, the node stores a `RequestState` structure,
which includes the number of request attempts made
and a list of nodes that have the required information. When
the requested info is obtained, the node deletes `RequestState`
for the corresponding request (cancels request).

The node sets a timeout for each sent request. The timeout is
implemented as a message to this node itself. This message is queued and
processed when it reaches its queue. Timeout deletion (cancelling timeout) means
its deletion from the message queue.

Cancelling a request means cancelling a corresponding timeout as well.

### Consensus Message from Bigger Height

- Update info about the height of blockchain on the corresponding node
- Send `RequestBlock` for the current height (height of the latest
  committed block + 1) to the message author, if such a request was not sent earlier

All events below are applicable only if the height of the message is the same as
validator height.

### Receiving Transaction

If this is the last transaction required to collect a known `Propose`,
cancel the corresponding `RequestTransactions`.

### Receiving `Propose`

- If this `Propose` was requested, cancel the request. A list
  of nodes that may have all transactions mentioned in the `Propose` message
  should be copied from the `RequestState` before its deletion
- If certain transactions from the `Propose` are not known,
  send `RequestTransactions` to the author of `Propose`

### Receiving `Prevote`

- If the node does not have the corresponding `Propose`, send
  `RequestPropose` to the author of `Prevote`
- If the sender specified `lock_round`, which is greater than the stored  
  [Proof-of-Lock (PoL)](consensus.md#locks), send
  `RequestPrevotes` for the locked proposal to the author of `Prevote`
- If the node have formed +2/3 `Prevote` messages for the same proposal, cancel
  the request `RequestPrevotes` for `Prevote` messages corresponding to this
  proposal (if they were requested earlier)

### Receiving `Precommit`

- If the node does not have a corresponding `Propose`, send
  `RequestPropose` to the author of `Precommit`
- If the message corresponds to a larger round than the saved PoL,
  send `RequestPrevotes` for this round to the author of `Precommit`
- If the node has formed +2/3 `Precommit` messages for the same proposal, cancel the
  corresponding `RequestPrecommit` (if they were requested
  earlier)

### Receiving `Block`

- Request the next block if there are validators at a height higher
  than current
- Update local height after committing the block locally

### Peers Timeout

Send a `RequestPeers` request to a random peer (auditor or validator) from
`peers` (list of known peers specified in [local
configuration](../../architecture/configuration.md#local-parameters)).
`RequestPeers` message is sent regularly with the timeout `peers_timeout`
defined in [the global configuration](../../architecture/configuration.md#global-parameters).
`RequestPeers` is used to obtain `Connect` messages from peers.

### Transition to New Height

Cancel all requests.

### Request Timeout

- Delete the validator, to which the request was sent, from the list of nodes that
  may have the requested data
- If the list of validators having the data to be requested is empty, cancel
  request
- Otherwise, make one more request attempt and start a new timer

## Algorithm for requests processing

This algorithm determines the processing of different types of request messages
by the node.

The processing of responses to requests is trivial:

- If `to` value (node which should receive request) does not correspond to the
  node's key, ignore the message
- Check the signature of the message

### `RequestPropose`

- If the message corresponds to a height higher than the one on which the node
  is, ignore the message
- If the node has `Propose` with the corresponding hash at the given height,
  send it

### `RequestTransactions`

Send all transactions the node has from those that were requested, as
separate messages. Transactions can either be already committed or be in the
pool of unconfirmed transactions.

### `RequestPrevotes`

- If the message does not match the height at which the node is, ignore the
  message
- Send as individual messages all the corresponding `Prevote` messages except
  those that the requestor has

### `RequestPrecommits`

- If the message corresponds to a height greater than that of the node,
  ignore the message
- Send as individual messages all the corresponding `Precommit` messages except
  those that the requestor has (the list of validators whose `Precommit` messages
  requestor already has is part of `RequestPrecommits`)

### `RequestBlock`

- If the message corresponds to a height not less than that of the node,
  ignore the message
- Form the message `Block` from the blockchain data and send it to the
  requestor

### `RequestPeers`

Send all the saved `Connect` messages from peers to the requestor.
