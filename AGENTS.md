# CampusClaw Development Rules

本项目采用 Spec-Driven Development（SDD）。

1. 在没有对应 OpenSpec change 和可验收 Scenario 的情况下，不得编写业务代码。
2. 实现必须以 openspec/changes/ 下的 proposal、design、spec 和 tasks 为依据。
3. 第 2 课阶段只允许创建和修改规约文件，不得实现业务代码。
4. tasks.md 中任务只有在实现完成并通过对应 verify 后才能从 [ ] 改为 [x]。
5. 不得通过前端隐藏按钮代替服务端权限校验。
6. 班级隔离必须由服务端强制执行。
7. 未经明确要求，不修改当前项目目录之外的文件或全局配置。
