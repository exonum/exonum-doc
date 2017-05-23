# Timeout Adjustment

_Round timeout_ is the time that determines the frequency of acceptance of new
blocks. Creating blocks with too low timeout leads to increase in the
consumption of resources for blocks storage. Creating blocks with too high
timeout leads to delay increase in the applying of transactions. **Timeout
adjustment algorithm** allows to optimize the frequency of creating blocks, in
order to include the maximum number of transactions per block if there are a
lot of transactions, and on the other hand, to do not create new blocks too
often if there are too few transactions.

Timeout adjustment is executed after each block acceptance.

**_Block load_** is the ratio of the number of average transactions in the block
for some period of time to the maximum number of transactions in the block. If
**_block load_** is less than the specified **_optimal_block_load_**, then the
timeout increases. And vice versa, if **_block load_** is greater than
**_optimal_block_load_**, then the timeout decreases.

Next round timeout is calculated using the following formula:

_next_timeout = target_timeout \* adjustment_speed + previous_timeout \*
(1 - adjustment_speed)_,

where

_adjustment_speed_ determines how fast the timeout changes when the number of
transactions per second changes;

_previous_timeout_ is previous timeout value;

- _target_timeout = max_timeout - (max_timeout - previous_timeout) \*
  load_percent_, **if** _current_load < optimal_load_;

- _target_timeout = previous_timeout - (previous_timeout - min_timeout) \*
  (load_percent - 1) / (1 / optimal_block_load - 1)_, **if** _current_load >=
  optimal_load_;

_max_timeout_ and _min_timeout_ are respectively upper bound and lower bound of
the possible timeout values;

_optimal_load = txs_block_limit \* optimal_block_load_;

_txs_block_limit_ is the maximum number of transactions in a block;

_load_percent = current_load / optimal_load_;

_current_load_ is current block load in transactions per second.

**TODO** add graph
