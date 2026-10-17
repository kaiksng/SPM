# Definition of Done

A user story is Done only when all of the following are true:

1. All acceptance criteria in the current Jira version of the story are met.
2. Each acceptance criterion has automated tests, and the pull request is reviewed, approved, green on all CI checks and merged into `main`.
3. Functional test cases for the story, each traced to an acceptance criterion, were executed and all passed.
4. The story works on the shared environment (hosted app and database).
5. The Product Owner accepts the story and moves it to Done in Jira.
