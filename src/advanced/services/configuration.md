# Configuration Update Service

Configuration service of Exonum blockchain allows modifying Exonum blockchain
configuration by means of propose config and vote for proposed config transactions
signed by validators who are actual blockchain participants.

Configuration service contains http api implementation for public queries (get
actual/following configuration, etc.) and private queries, intended for use only
by validator nodes' maintainers (post configuration propose, post vote for a
configuration propose).

Exonum blockchain configuration is composed of:

- consensus algorithm parameters
- list of validators' public keys - list of identities of consensus participants
- configuration of all services, plugged in for a specific blockchain instance.

It also contains auxiliary fields:

- `actual_from` - blockchain height, upon reaching which current config is to
  become actual.
- `previous_cfg_hash` - hash of previous configuration, which validators' set is
  allowed to cast votes for current config.

## Global variable service http api

All `hash`es, `public-key`s and `signature`s in tables are hexadecimal strings.
`config-body` is a valid json, corresponding to [exonum
config][stored_configuration] serialization. See [Configuration service
tutorial][http_api] for more details on http api.

### Public endpoints

Endpoint | Description | Query parameters
---------|-------------|-----------------
`/api/services/configuration/v1/configs/actual` | Lookup actual config | None
`/api/services/configuration/v1/configs/following` | Lookup already scheduled following config which hasn't yet taken effect.<br>`null` if no config is scheduled | None
`/api/services/configuration/v1/configs/<config-hash>` | Lookup config by config hash. If no propose was submitted for a config (genesis config) - "propose" is `null`. If only propose is present, then "committed_config" is `null`. "propose" key has json-object values, that match **propose-template**. | `<config-hash>` - hash of looked up config.
`/api/services/configuration/v1/configs/<config-hash>/votes` | Lookup votes for a config propose by config hash. If a vote from validator is absent - `null` returned at the corresponding index in json array | `<config-hash>` - hash of looked up config. |
`/api/services/configuration/v1/configs/committed?previous_cfg_hash=`<br>`<config-hash>&actual_from=<lowest-actual-from>` | Lookup all committed configs in commit order. | `<previous_cfg_hash>` and `<lowest_actual_from>` are optional filtering parameters.<br>**config-body** is included in response if its _previous_cfg_hash_ field equals the corresponding parameter.<br>It's included if its _actual_from_ field is greater or equal than corresponding parameter.
`/api/services/configuration/v1/configs/proposed?previous_cfg_hash=`<br>`<config-hash>&actual_from=<lowest-actual-from>`  | Lookup all proposed configs in commit order.<br> | `<previous_cfg_hash>` and `<lowest_actual_from>` are optional filtering parameters.<br>**propose-template** is included in response if its _previous_cfg_hash_ field equals the corresponding parameter.<br>It's included if its _actual_from_ field is greater or equal than corresponding parameter.

### Private endpoints

Posting a new config can be performed by any validator maintainer via private
endpoint.

- it's important to specify `previous_cfg_hash` in new config body, which should
  be equal to `hash` of a config, actual at the moment when the new propose is
  being submitted.

- `cfg_hash`, returned in response to `postpropose` request, should be used as
  `<config-hash-vote-for>` parameter of `postvote` request.

Endpoint                                                                 | Description
------------------------------------------------------------------------ | ---------------------------------------------
`/api/services/configuration/v1/configs/postpropose`                     | Post proposed config body
`/api/services/configuration/v1/configs/<config-hash-vote-for>/postvote` | Vote for a configuration having specific hash

[stored_configuration]: http://exonum.com/doc/crates/exonum/blockchain/config/struct.StoredConfiguration.html
[http_api]: https://github.com/exonum/exonum-configuration/blob/master/doc/testnet-api-tutorial.md#global-variable-service-http-api
