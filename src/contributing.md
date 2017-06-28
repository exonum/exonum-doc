# Contributing to Exonum

The [Exonum Core project][exonum-core] and [other public Exonum repositories][exonum-org]
operate an open contributor model where anyone is welcome to contribute
towards development in the form of peer review, testing and patches.
This document explains the practical process and guidelines for contributing.

!!! note
    This contribution guide is partially derived from [the Bitcoin contribution guide][btc-contrib].

## Contributor Hierarchy

In terms of structure, there is no particular concept of “Exonum core developers”
in the sense of privileged people. Open source often naturally revolves
around meritocracy where longer term contributors gain more trust
from the developer community. However, some hierarchy is necessary
for practical purposes. As such there are **repository maintainers**
who are responsible for merging pull requests as well as a **lead maintainer**
who is responsible for the release cycle, overall merging, moderation
and appointment of maintainers.

## Contributor Workflow

The codebase is maintained using the contributor workflow where everyone
without exception contributes patch proposals using [*pull requests*][gh:pr] (PRs).
This facilitates social contribution, easy testing and peer review.

To contribute a patch, the workflow is as follows:

- Fork the relevant repository
- Create a topic branch
- Push commits to the branch
- Create a pull request for merging the topic branch

### Adding Commits

In general [commits should be atomic](https://en.wikipedia.org/wiki/Atomic_commit#Atomic_commit_convention)
and diffs should be easy to read. For this reason do not mix any formatting fixes
or code moves with actual code changes.

Commit messages should be verbose by default consisting of a short subject line
(50 chars max), a blank line and detailed explanatory text as separate paragraph(s);
unless the title alone is self-explanatory (like “Correct typo in init.rs”)
then a single title line is sufficient.
Commit messages should be helpful to people reading your code in the future,
so explain the reasoning for your decisions.

!!! tip
    Further explanation about commit message conventions is available [here][git:messages].

If a particular commit references another issue or PR, please add the reference,
for example `refs #1234`, or `fixes #4321`.
Using the `fixes` or `closes` keywords will cause the corresponding issue
to be closed when the pull request is merged.

!!! tip
    Please refer to the [Git manual](https://git-scm.com/doc) for more information
    about Git.

### Pull Request Naming and Descriptions

If a pull request is specifically not to be considered for merging (yet),
please prefix its title with `WIP:`.
You may use [task lists][gh:task-lists]
in the body of the pull request to indicate pending tasks.

The body of the pull request should contain enough description about what
the patch does together with any justification or reasoning.
You should include references to any discussions.

### Peer Reviews and PR Amendments

At this stage one should expect comments and review from other contributors.
You can add more commits to your pull request by committing them locally
and pushing to your fork until you have satisfied all feedback.

The length of time required for peer review is unpredictable and will vary
from pull request to pull request.

!!! tip
    Please refrain from creating several pull requests for the same change.
    Use the pull request that is already open (or was created earlier)
    to amend changes. This preserves the discussion and review that happened earlier
    for the respective change set.

### Preparations for Merge

If your pull request is accepted for merging, you may be asked by a maintainer
to squash and/or [rebase](https://git-scm.com/docs/git-rebase) your commits
before it will be merged. The basic squashing workflow is shown below.

```shell
git checkout your_branch_name
git rebase --interactive HEAD~n
# n is normally the number of commits in the pull

# Set commits from 'pick' to 'squash', save and quit;
# on the next screen, edit/refine commit messages;
# save and quit.

# Force-push to GitHub
git push --force
```

## Pull Request Philosophy

Pull requests should always be focused. For example,
a pull request could add a feature,
fix a bug, or refactor code; but not a mixture. Please also avoid super pull requests
which attempt to do too much, are overly large, or overly complex
as this makes review difficult.

### Features

When adding a new feature, thought must be given to the long term technical debt
and maintenance that feature may require after inclusion.
Before proposing a new feature that will require maintenance,
please consider if you are willing to maintain it (including bug fixing).
If features get orphaned with no maintainer in the future,
they may be removed by the Repository Maintainer.

### Refactoring

Refactoring is a necessary part of any software project's evolution.
The following guidelines cover refactoring pull requests for the project.

There are three categories of refactoring:

- code only moves
- code style fixes
- code refactoring

In general, refactoring pull requests should not mix
these three kinds of activity in order to make refactoring pull requests
easy to review and uncontroversial. In all cases, refactoring PRs must not change
the behavior of code within the pull request (bugs must be preserved as is).

Project maintainers aim for a quick turnaround on refactoring pull requests,
so where possible keep them short, uncomplex and easy to verify.

## Decision Making Process

Whether a pull request is merged into the targeted Exonum repository
rests with the project merge maintainers and ultimately the project lead.

Maintainers will take into consideration if a patch is in line
with the general principles of the project; meets the minimum standards for inclusion;
and will judge the general consensus of contributors.

In general, all pull requests must:

- have a clear use case, fix a demonstrable bug or serve the greater good
  of the project (for example refactoring for modularization);
- be well peer reviewed;
- have unit tests and sandbox tests where appropriate;
- follow code style guidelines;
- not break the existing test suite;
- where bugs are fixed, where possible, there should be unit tests demonstrating
  the bug and also proving the fix. This helps prevent regression.

### Peer Review

Anyone may participate in peer review which is expressed by comments
in the pull request. Typically reviewers will review the code for obvious errors,
as well as test out the patch set and opine on the technical merits of the patch.
Project maintainers take into account the peer review when determining
if there is consensus to merge a pull request.

The following language is used within pull-request comments:

- LGTM means “Looks Good To Me”
- Concept LGTM means “I agree in the general principle of this pull request”

Reviewers should include the commit hash which they reviewed in their comments.

Project maintainers reserve the right to weigh the opinions of peer reviewers
using common sense judgment and also may weight based on meritocracy:
Those that have demonstrated a deeper commitment and understanding
towards the project (over time) or have clear domain expertise
may naturally have more weight, as one would expect in all walks of life.

Where a patch set affects consensus critical code, the bar will be set much higher
in terms of discussion and peer review requirements, keeping in mind that mistakes
could be very costly to the wider community. This includes refactoring
of consensus critical code.

## Release Policy

The project leader is the release manager for each Exonum Core release.

## Copyright

By contributing to a public Exonum repository, you agree to license your work under
the license specified in the `LICENSE` file of the relevant repository
unless specified otherwise at the top of the file itself.
Any work contributed where you are not the original author
must contain its license header with the original author(s) and source.

[btc-contrib]: https://github.com/bitcoin/bitcoin/blob/master/CONTRIBUTING.md
[exonum-core]: http://github.com/exonum/exonum-core/
[exonum-org]: http://github.com/exonum/
[gh:pr]: https://help.github.com/articles/about-pull-requests/
[gh:task-lists]: https://help.github.com/articles/basic-writing-and-formatting-syntax/#task-lists
[git:messages]: http://chris.beams.io/posts/git-commit/
