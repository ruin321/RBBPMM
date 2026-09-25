// WPF 侧的测试涉及两类进程级共享状态：
//   1. LocalizationService.Current（静态单例，XAML 绑定要靠它）；
//   2. Application.Current / WPF 布局线程（AppStartupSmokeTests 会真造一个 Application）。
// 并行跑会让它们互相踩，出现「同一个测试时好时坏」。整个程序集串行执行，代价可忽略（~2s）。
[assembly: CollectionBehavior(DisableTestParallelization = true)]
