# Configuration Update Service

**Configuration update service** allows modifying [the global configuration](../../architecture/configuration.md)
by the means of *proposing* a new configuration and *voting* for proposed configurations
among the validators.

## General Idea

Any validator node can propose a new configuration, by broadcasting a corresponding
propose transaction to the network. The transaction includes a new configuration
in the JSON format, along with two auxiliary fields:

- `actual_from` is a non-negative integer height,
  upon reaching which the new configuration (if accepted) will activate.
- `previous_cfg_hash` is the hash of the configuration that the proposal updates

Validators may vote for configuration proposals by submitting vote transactions
to the network. Each validator can cast
a single vote for any configuration proposal. If the proposal gets a supermajority
of votes (more than 2/3 of the validators), then the proposal becomes locked in,
and is referred to as the *following configuration*. All the validators
switch to the following configuration (activate it) as soon as they reach
the `actual_from` specified in the proposal.

There may be several proposals with the same `previous_cfg_hash`; the transaction
execution rules guarantee that only one of them will get activated.

**Notice.** The threshold of 2/3 of validators is chosen to reflect the security
model used in [the consensus algorithm](../consensus/consensus.md). According
to this model, up to 1/3 of validators may be compromised or be non-responsive at
any time.

## REST API

Configuration service specifies REST API for public queries (get
actual/following configuration, etc.) and private queries, intended for use only
by the administrators of validator nodes (post a configuration proposal;
vote for a configuration proposal).

**Tip.** See [Configuration service tutorial][http_api] for more details
on the config update service API.

### Types

As per [Google Closure Compiler][closurec] conventions,
`?` before the type denotes a nullable type, and `=` after the type denotes
an optional type.

`integer` type denotes a non-negative integer number.

#### Hash, PublicKey

`Hash` and `PublicKey`s below are hexadecimal strings of the appropriate length
(64 hex digits, i.e., 32 bytes).

#### ConfigBody

`ConfigBody` is a JSON object corresponding to the [Exonum
config][stored_configuration] serialization. It has the following fields:

- **previous_cfg_hash**: Hash  
  Hash of the previous active configuration.
- **actual_from**: integer  
  The height from which the configuration became actual.
- **validators**: Array\<PublicKey\>  
  List of validators' public keys.
- **consensus**: Object  
  Consensus-specific configuration parameters.
- **consensus.peers_timeout**: integer  
  Peer exchange timeout (in ms).
- **consensus.propose_timeout**: integer  
  Proposal timeout (ms) after the new height beginning.
- **consensus.round_timeout**: integer  
  Interval (ms) between rounds.
- **consensus.status_timeout**: integer  
  Period (ms) of sending a `Status` message.
- **consensus.txs_block_limit**: integer  
  Maximum number of transactions per block.
- **services**: Object  
  Service-specific configuration parameters.

#### Propose

`Proposal` is a JSON object corresponding to the [Exonum
config][config_propose] serialization. It has the following fields:

- **tx_propose**: Object  
  Information about configuration and its author.
- **tx_propose.from**: PublicKey  
  Author's public key.
- **tx_propose.cfg**: string  
  String containing JSON serialization of proposed configuration.
- **votes_history_hash**: Hash  
  Hash of the proposed configuration.
- **num_votes**: integer  
  Number of votes for the proposed configuration.

**{base_path}** below stands for `/api/services/configuration/v1`.

Response samples may be found [here][response_samples].

### Actual Configuration

    GET {base_path}/configs/actual

Looks up the actual global configuration.

#### Parameters

None.

#### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration presently in use.
- **hash**: Hash  
  Hash of the actual configuration.

### Following Configuration

    GET {base_path}/configs/following

Looks up already scheduled following configuration which hasn't yet taken effect.
Returns `null` if no configuration is scheduled.

#### Parameters

None.

#### Response

JSON object with the following fields:

- **config**: ConfigBody  
  Global configuration scheduled to take effect in the future.
- **hash**: Hash  
  Hash of the scheduled configuration.

### Configuration by Hash

    GET {base_path}/configs/{config_hash}

Looks up configuration (including proposals) by configuration hash.

#### Parameters

- **config_hash**: Hash  
  Hash of configuration to look up.

#### Response

JSON object with the following fields:

- **committed_config**: ?ConfigBody  
  Configuration with the specified hash.
  If only proposal is present, `null`.
- **propose**: ?Propose  
  Proposal for the retrieved configuration.
  If no proposal was submitted for a configuration (genesis configuration),
  `null`.

### Votes for Configuration

    GET {base_path}/configs/{config_hash}/votes

Looks up votes for a configuration propose by configuration hash.

#### Parameters

`config_hash` - hash of configuration to look up.

#### Response

JSON object with the following fields:

- **Votes**: Array\<?Vote\>  
  Votes for the configuration. Indexing of the `Votes` array corresponds
  to the indexing of validators public keys in [actual configuration](../../architecture/configuration.md#genesis).
  If a vote from the validator is absent, then `null` is returned
  at the corresponding index.

### Committed Configurations

    GET {base_path}/configs/committed

Looks up all committed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Query Parameters

- **previous_config_hash**: Hash=  
  If present, filters configurations by the specified previous configuration hash.
- **actual_from**: integer=  
  If present, filters configurations by the specified minimum for the height
  from which the configuration became actual.

#### Response

Array of objects with the following fields:

- **config**: ConfigBody  
  Committed configuration satisfying filter criteria.
- **hash**: Hash  
  Hash of the configuration.

### Proposed Configurations

    GET {base_path}/configs/proposed?previous_cfg_hash

Looks up all proposed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Query Parameters

- **previous_config_hash**: Hash=  
  If present, filters configurations by the specified previous configuration hash.
- **actual_from**: integer=  
  If present, filters configurations by the specified minimum for the height
  from which the configuration became actual.

#### Response

Array of objects with the following fields:

- **config**: ConfigBody  
  Proposed configuration satisfying filter criteria.
- **hash**: Hash  
  Hash of the configuration.

## Configuration update service transactions

Transactions are used to for agreement of new configuration by validators voting
mechanism. Configuration update service transactions can be created using private
POST endpoints by any validator maintainer. When converting POST endpoint into a
transaction, the signature is automatically added.

## TxConfigPropose

`TxConfigPropose` is new configuration proposal.

### Data Layout

- **cfg**: ConfigBody  
  Contains JSON with proposed configuration. Its format was described above.

- **from**: PublicKey  
  Public key of transaction author.

### Verification

Signature verification takes place. If any there is valid
signature on message, message gets committed to database.

### Execution

Propose transactions will only get submitted and executed with state change
if all of the following conditions take place:

1. new config body constitutes a valid JSON string and corresponds to
  [StoredConfiguration](http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html)
  format.

2. `previous_cfg_hash` in proposed config body equals to hash of *actual*
  config.

3. `actual_from` in proposed config body is greater than *current height*.
  *current height* is determined as the height of last
  committed block + 1. This is important to obtain sequential view of
  configs commit history. And, more important, the linear view of history
  of votes which conditioned scheduling of a config.

4. a *following* config isn't already present.

5. *actual* config contains the node-sender's public key in array of
  `validators` field, as specified in `from` field of propose
  transaction. The `from` field is determined by public key of node whose
  `postpropose` endpoint is accessed for signing the transaction on
  maintainter's behalf.

6. propose of config, which evaluates to the same hash, hasn't already
  been submitted.

If all the checks pass, execution results in modifying some tables and
`state_hash` field (apart from `tx_hash`).

### Endpoint

    POST {base_path}/configs/postpropose

Posts proposed configuration body.

#### Parameters

`config_body` to propose. It should be sent as a request body.

#### Response

JSON object with the following fields:

- **cfg_hash**: Hash  
  Hash of the proposed configuration. Should be used as `config_hash_vote_for`
  parameter of `postvote` request.

- **tx_hash**: Hash  
  Hash of the corresponding `TxConfigPropose` transaction.

## TxVote

`TxVote` is vote for proposed configuration.

### Data Layout

- **cfg_hash**: Hash  
  Hash of configuration to vote for

- **from**: PublicKey  
  Public key of transaction author.

### Verification

Signature verification takes place. If any there is valid
signature on message, message gets committed to database.

### Execution

Vote transactions will only get submitted and executed with state change
if all of the following conditions take place:

1. the vote transaction references a config propose with known config
  hash.

2. a *following* config isn't already present.

3. *actual* config contains the node-sender's public key in
  `validators` field, as specified in `from` field of vote transaction.
  The `from` field is determined by public key of node whose
  `postvote` endpoint is accessed for signing the transaction on
  maintainter's behalf.

4. `previous_cfg_hash` in the config propose, which is referenced by
  vote transaction, is equal to hash of *actual* config.

5. `actual_from` in the config propose, which is referenced by vote
  transaction, is greater than *current height*.

6. no vote for the same proposal from the same node's public key has been
  submitted previously.

If all the checks pass, execution results in modifying some tables and
`state_hash` field (apart from `tx_hash`).

### Endpoint

    POST {base_path}/configs/{config_hash_vote_for}/postvote

Votes for a configuration having specific hash.

#### Parameters

`config_hash_vote_for` is a configuration hash to vote for.

#### Response

JSON object with the following fields:

- **tx_hash**: Hash  
  Hash of the corresponding `TxVote` transaction.

[stored_configuration]: http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html
[config_propose]: http://exonum.com/doc/crates/configuration_service/struct.StorageValueConfigProposeData.html
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum-configuration/blob/master/doc/response-samples.md
[closurec]: https://github.com/google/closure-compiler/wiki/Annotating-JavaScript-for-the-Closure-Compiler
