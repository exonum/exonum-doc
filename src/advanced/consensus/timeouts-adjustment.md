# Timeout Adjustment

The purpose of _timeout adjustment_ is to optimize the timeout, in order to
include the maximum number of transactions per block if there are a lot of
transactions, and on the other hand, to do not create new blocks too often
if there are too few transactions.

The frequency of _timeout adjustment_ is specified by **_adjustment_speed_**.

**_Block load_** is the ratio of the number of average transactions in the block
for some period of time to the maximum number of transactions in the block. If
**_block load_** is less than the specified **_optimal_block_load_**, then the
timeout increases. And vice versa, if **_block load_** is greater than
**_optimal_block_load_**, then the timeout decreases.
