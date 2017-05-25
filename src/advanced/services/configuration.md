# Configuration Update Service

Configuration service of Exonum blockchain allows modifying Exonum blockchain
configuration by means of propose configuration and vote for proposed configuration
transactions signed by validators who are actual blockchain participants.

Configuration service contains http api implementation for public queries (get
actual/following configuration, etc.) and private queries, intended for use only
by validator nodes' maintainers (post configuration propose, post vote for a
configuration propose).

Exonum blockchain configuration is composed of:

- consensus algorithm parameters
- list of validators' public keys - list of identities of consensus participants
- configuration of all services, plugged in for a specific blockchain instance.

It also contains auxiliary fields. These fields are used to identify nodes that
can vote for this configuration and determining the activation time of the
configuration in all nodes simultaneously:

- `actual_from` - blockchain height, upon reaching which current configuration is
  to become actual.
- `previous_cfg_hash` - hash of previous configuration, which validators' set is
  allowed to cast votes for current configuration.

## Global variable service http api

All `hash`es, `public-key`s and `signature`s in tables are hexadecimal strings.
`config-body` is a valid json, corresponding to [exonum
config][stored_configuration] serialization. See [Configuration service
tutorial][http_api] for more details on http api.

**{basePath}** below stands for `/api/services/configuration/v1`

Response samples may be found [here][response_samples].

### Actual Configuration

    GET {basePath}/configs/actual

Looks up the actual global configuration.

#### Parameters

None.

#### Response template

```JSON
{
  "config": config-body,
  "hash": config-hash
}
```

### Following Configuration

    GET {basePath}/configs/following

Looks up already scheduled following configuration which hasn't yet taken effect.
Returns `null` if no configuration is scheduled.

#### Parameters

None.

#### Response template

```JSON
{
  "config": config-body,
  "hash": config-hash
}
```

### Configuration by Hash

    GET {basePath}/configs/{config-hash}

Looks up configuration by configuration hash. If no propose was submitted for a
configuration (genesis configuration), then `propose` field is `null`. If only
propose is present, then `committed_config` field is `null`. `propose` key has
json-object values, that match **propose-template**.

#### Parameters

`{config-hash}` - hash of configuration to look up.

#### Response template

```JSON
{
 "committed_config": config_body,
 "propose": {
  "num_votes": integer,
  "tx_propose": {
   "cfg": config_body,
   "from": validator-public-key,
   "signature": validator-signature
  },
 "votes_history_hash": vote-history-hash
 }
}
```

### Votes for Configuration

    GET {basePath}/configs/{config-hash}/votes

Looks up votes for a configuration propose by configuration hash. If a vote from
the validator is absent, then `null` is returned at the corresponding index in
json array.

#### Parameters

`{config-hash}` - hash of configuration to look up.

#### Response template

```JSON
{
 "Votes": [
  {
   "cfg_hash": config-hash,
   "from": validator-public-key,
   "signature": validator-signature
  },
  null,
  ...
 ]
}
```

### Committed Configurations

    GET {basePath}/configs/committed?previous_cfg_hash={previous-config-hash}&actual_from={lowest-actual-from}

Looks up all committed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Parameters

- `{previous-config-hash}`: hash (optional)  
  Filters configurations by the specified previous configuration hash.

- `{lowest_actual_from}`: hash (optional)
  Filters configurations by the specified minimum for the height from which the
  configuration became actual.

#### Response template

```JSON
[
 {
  "config": config-body,
  "hash": config-hash
 },
 {
  "config": config-body,
  "hash": config-hash
 },
 ...
]
```

### Proposed Configurations

    GET {basePath}/configs/proposed?previous_cfg_hash={config-hash}&actual_from={lowest-actual-from}

Looks up all proposed configurations in the order configuration proposals are
committed as transactions to the Exonum blockchain.

#### Parameters

`{previous_cfg_hash}` and `{lowest_actual_from}` are optional filtering parameters.
**propose-template** is included in response if its _previous_cfg_hash_ field
equals the corresponding parameter. It's included if its _actual_from_ field is
greater or equal than corresponding parameter.

#### Response template

```JSON
[
 {
  "propose-data": propose-template,
  "hash": config-hash
 },
 {
  "propose-data": propose-template,
  "hash": config-hash
 },
 ...
]
```

### Private endpoints

Posting a new configuration can be performed by any validator maintainer via private
endpoint.

- it's important to specify `previous_cfg_hash` in new configuration body, which
  should be equal to `hash` of a configuration, actual at the moment when the new
  propose is being submitted.

- `cfg_hash`, returned in response to `postpropose` request, should be used as
  `{config-hash-vote-for}` parameter of `postvote` request.

### Propose Configuration

    GET {basePath}/configs/postpropose

Posts proposed configuration body.

#### Parameters

None.

#### Response template

```JSON
{
 "cfg_hash": configuration-hash,
 "tx_hash": transaction-hash
}
```

### Vote for Configuration

    GET {basePath}/configs/{config-hash-vote-for}/postvote

Votes for a configuration having specific hash.

#### Parameters

`{config-hash-vote-for}` is a configuration hash to vote for.

#### Response template

```JSON
{
 "tx_hash": transaction-hash
}
```

[stored_configuration]: http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
[response_samples]: https://github.com/exonum/exonum-configuration/blob/master/doc/response-samples.md
