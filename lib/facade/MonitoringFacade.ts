import { Aspects, Stack } from "aws-cdk-lib";
import { CompositeAlarm, Dashboard, IWidget } from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";

import { MonitoringAspectProps } from "./IMonitoringAspect";
import { MonitoringAspect } from "./MonitoringAspect";
import {
  AddAlarmProps,
  AddCompositeAlarmProps,
  AlarmFactory,
  AlarmFactoryDefaults,
  AlarmWithAnnotation,
  AwsConsoleUrlFactory,
  MetricFactory,
  MetricFactoryDefaults,
  Monitoring,
  MonitoringScope,
} from "../common";
import {
  DefaultDashboardFactory,
  DefaultDashboards,
  DefaultWidgetFactory,
  HeaderLevel,
  HeaderWidget,
  IDashboardSegment,
  IWidgetFactory,
  MonitoringDashboardsOverrideProps,
  SingleWidgetDashboardSegment,
} from "../dashboard";
import {
  IDynamicDashboardSegment,
  StaticSegmentDynamicAdapter,
} from "../dashboard/DynamicDashboardSegment";
import { IDynamicDashboardFactory } from "../dashboard/IDynamicDashboardFactory";
import {
  ApiGatewayMonitoring,
  ApiGatewayMonitoringProps,
  ApiGatewayV2HttpApiMonitoring,
  ApiGatewayV2HttpApiMonitoringProps,
  AppSyncMonitoring,
  AppSyncMonitoringProps,
  AuroraClusterMonitoring,
  AuroraClusterMonitoringProps,
  AutoScalingGroupMonitoring,
  AutoScalingGroupMonitoringProps,
  BillingMonitoring,
  BillingMonitoringProps,
  CertificateManagerMonitoring,
  CertificateManagerMonitoringProps,
  CloudFrontDistributionMonitoring,
  CloudFrontDistributionMonitoringProps,
  CodeBuildProjectMonitoring,
  CodeBuildProjectMonitoringProps,
  CustomMonitoring,
  CustomMonitoringProps,
  DocumentDbMonitoring,
  DocumentDbMonitoringProps,
  DynamoTableGlobalSecondaryIndexMonitoring,
  DynamoTableGlobalSecondaryIndexMonitoringProps,
  DynamoTableMonitoring,
  DynamoTableMonitoringProps,
  Ec2ApplicationLoadBalancerMonitoringProps,
  EC2Monitoring,
  EC2MonitoringProps,
  Ec2NetworkLoadBalancerMonitoringProps,
  Ec2ServiceMonitoring,
  Ec2ServiceMonitoringProps,
  ElastiCacheClusterMonitoring,
  ElastiCacheClusterMonitoringProps,
  FargateApplicationLoadBalancerMonitoringProps,
  FargateNetworkLoadBalancerMonitoringProps,
  FargateServiceMonitoring,
  FargateServiceMonitoringProps,
  FluentBitMonitoring,
  FluentBitMonitoringProps,
  getQueueProcessingEc2ServiceMonitoring,
  getQueueProcessingFargateServiceMonitoring,
  GlueJobMonitoring,
  GlueJobMonitoringProps,
  KinesisDataAnalyticsMonitoring,
  KinesisDataAnalyticsMonitoringProps,
  KinesisDataStreamMonitoring,
  KinesisDataStreamMonitoringProps,
  KinesisFirehoseMonitoring,
  KinesisFirehoseMonitoringProps,
  LambdaFunctionMonitoring,
  LambdaFunctionMonitoringProps,
  LogMonitoring,
  LogMonitoringProps,
  NetworkLoadBalancerMonitoring,
  NetworkLoadBalancerMonitoringProps,
  OpenSearchClusterMonitoring,
  OpenSearchClusterMonitoringProps,
  QueueProcessingEc2ServiceMonitoringProps,
  QueueProcessingFargateServiceMonitoringProps,
  RdsClusterMonitoring,
  RdsClusterMonitoringProps,
  RdsInstanceMonitoring,
  RdsInstanceMonitoringProps,
  RedshiftClusterMonitoring,
  RedshiftClusterMonitoringProps,
  S3BucketMonitoring,
  S3BucketMonitoringProps,
  SecretsManagerMonitoring,
  SecretsManagerMonitoringProps,
  SecretsManagerSecretMonitoring,
  SecretsManagerSecretMonitoringProps,
  SimpleEc2ServiceMonitoringProps,
  SimpleFargateServiceMonitoringProps,
  SnsTopicMonitoring,
  SnsTopicMonitoringProps,
  SqsQueueMonitoring,
  SqsQueueMonitoringProps,
  SqsQueueMonitoringWithDlq,
  SqsQueueMonitoringWithDlqProps,
  StepFunctionActivityMonitoring,
  StepFunctionActivityMonitoringProps,
  StepFunctionLambdaIntegrationMonitoring,
  StepFunctionLambdaIntegrationMonitoringProps,
  StepFunctionMonitoring,
  StepFunctionMonitoringProps,
  StepFunctionServiceIntegrationMonitoring,
  StepFunctionServiceIntegrationMonitoringProps,
  SyntheticsCanaryMonitoring,
  SyntheticsCanaryMonitoringProps,
  WafV2Monitoring,
  WafV2MonitoringProps,
} from "../monitoring";

/**
 * A function that, when given an alarm, returns modified inputs that
 * can be used to create additional alarms, slightly adjusted from the original one.
 * The function can be used to clone alarms.
 *
 * Implementers of this function can use the original alarm configuration to specify a new alarm,
 * or they can return undefined to skip the creation of an alarm.
 */
export interface AlarmCloneFunction {
  (alarm: AlarmWithAnnotation): AddAlarmProps | undefined;
}

export interface MonitoringFacadeProps {
  /**
   * Defaults for metric factory.
   *
   * @default - empty (no preferences)
   */
  readonly metricFactoryDefaults?: MetricFactoryDefaults;

  /**
   * Defaults for alarm factory.
   *
   * @default - actions enabled, facade logical ID used as default alarm name prefix
   */
  readonly alarmFactoryDefaults?: AlarmFactoryDefaults;

  /**
   * Defaults for dashboard factory.
   *
   * @default - An instance of {@link DynamicDashboardFactory}; facade logical ID used as default name
   */
  readonly dashboardFactory?: IDynamicDashboardFactory;
}

/**
 * An implementation of a {@link MonitoringScope}.
 *
 * This is a convenient main entrypoint to monitor resources.
 *
 * Provides methods for retrieving and creating alarms based on added segments that are subclasses of
 * {@link Monitoring}.
 */
export class MonitoringFacade extends MonitoringScope {
  protected readonly metricFactoryDefaults: MetricFactoryDefaults;
  protected readonly alarmFactoryDefaults: AlarmFactoryDefaults;
  public readonly dashboardFactory?: IDynamicDashboardFactory;
  protected readonly createdSegments: (
    | IDashboardSegment
    | IDynamicDashboardSegment
  )[];
  protected readonly createdComposites: CompositeAlarm[];
  protected readonly createdClones: AlarmWithAnnotation[];

  constructor(scope: Construct, id: string, props?: MonitoringFacadeProps) {
    super(scope, id);

    this.metricFactoryDefaults = props?.metricFactoryDefaults ?? {};
    this.alarmFactoryDefaults = props?.alarmFactoryDefaults ?? {
      alarmNamePrefix: id,
      actionsEnabled: true,
    };
    this.dashboardFactory =
      props?.dashboardFactory ??
      new DefaultDashboardFactory(this, `${id}-Dashboards`, {
        dashboardNamePrefix: id,
      });

    this.createdSegments = [];
    this.createdComposites = [];
    this.createdClones = [];
  }

  // FACTORIES
  // =========

  createAlarmFactory(alarmNamePrefix: string): AlarmFactory {
    return new AlarmFactory(this, {
      globalAlarmDefaults: this.alarmFactoryDefaults,
      globalMetricDefaults: this.metricFactoryDefaults,
      localAlarmNamePrefix: alarmNamePrefix,
    });
  }

  createAwsConsoleUrlFactory(): AwsConsoleUrlFactory {
    const stack = Stack.of(this);
    const awsAccountId = this.metricFactoryDefaults.account ?? stack.account;
    const awsAccountRegion = this.metricFactoryDefaults.region ?? stack.region;
    return new AwsConsoleUrlFactory({ awsAccountRegion, awsAccountId });
  }

  createMetricFactory(): MetricFactory {
    return new MetricFactory(this, {
      globalDefaults: this.metricFactoryDefaults,
    });
  }

  createWidgetFactory(): IWidgetFactory {
    return new DefaultWidgetFactory();
  }

  // GENERIC
  // =======

  /**
   * Adds a dashboard segment which returns dynamic content depending on dashboard type.
   *
   * @param segment dynamic segment to add.
   */
  addDynamicSegment(segment: IDynamicDashboardSegment): this {
    this.dashboardFactory?.addDynamicSegment(segment);
    this.createdSegments.push(segment);
    return this;
  }

  /**
   * Adds a dashboard segment to go on one of the {@link DefaultDashboards}.
   *
   * @param segment segment to add
   * @param overrideProps props to specify which default dashboards this segment is added to.
   */
  addSegment(
    segment: IDashboardSegment,
    overrideProps?: MonitoringDashboardsOverrideProps,
  ): this {
    const adaptedSegment = new StaticSegmentDynamicAdapter({
      segment,
      overrideProps,
    });
    this.dashboardFactory?.addDynamicSegment(adaptedSegment);
    this.createdSegments.push(segment);
    return this;
  }

  /**
   * @deprecated - prefer calling dashboardFactory.getDashboard directly.
   *
   * @returns default detail dashboard
   */
  createdDashboard(): Dashboard | undefined {
    return this.dashboardFactory?.getDashboard(DefaultDashboards.DETAIL);
  }

  /**
   * @deprecated - prefer calling dashboardFactory.getDashboard directly.
   *
   * @returns default summary dashboard
   */
  createdSummaryDashboard(): Dashboard | undefined {
    return this.dashboardFactory?.getDashboard(DefaultDashboards.SUMMARY);
  }

  /**
   * @deprecated - prefer calling dashboardFactory.getDashboard directly.
   *
   * @returns default alarms dashboard
   */
  createdAlarmDashboard(): Dashboard | undefined {
    return this.dashboardFactory?.getDashboard(DefaultDashboards.ALARMS);
  }

  /**
   * Returns the created alarms across all added segments that subclass {@link Monitoring}
   * added up until now.
   */
  createdAlarms(): AlarmWithAnnotation[] {
    const monitoringAlarms = this.createdMonitorings().flatMap((monitoring) =>
      monitoring.createdAlarms(),
    );
    return monitoringAlarms.concat(this.createdClones);
  }

  /**
   * Returns a subset of created alarms that are marked by a specific custom tag.
   *
   * @param customTag tag to filter alarms by
   */
  createdAlarmsWithTag(customTag: string): AlarmWithAnnotation[] {
    return this.createdAlarms().filter((alarm) =>
      alarm.customTags?.includes(customTag),
    );
  }

  /**
   * Returns a subset of created alarms that are marked by a specific disambiguator.
   *
   * @param disambiguator disambiguator to filter alarms by
   */
  createdAlarmsWithDisambiguator(disambiguator: string): AlarmWithAnnotation[] {
    return this.createdAlarms().filter(
      (alarm) => alarm.disambiguator === disambiguator,
    );
  }

  /**
   * Returns the added composite alarms.
   */
  createdCompositeAlarms(): CompositeAlarm[] {
    return this.createdComposites;
  }

  /**
   * Returns the added segments that subclass {@link Monitoring}.
   */
  createdMonitorings(): Monitoring[] {
    return this.createdSegments
      .filter((s) => s instanceof Monitoring)
      .map((s) => s as Monitoring);
  }

  /**
   * Returns all the added segments.
   */
  createdDashboardSegments(): (IDashboardSegment | IDynamicDashboardSegment)[] {
    return Array.from(this.createdSegments);
  }

  // COMPOSITE ALARM CREATORS
  // ========================

  /**
   * Finds a subset of created alarms that are marked by a specific custom tag and creates a composite alarm.
   * This composite alarm is created with an 'OR' condition, so it triggers with any child alarm.
   * NOTE: This composite alarm is not added among other alarms, so it is not returned by createdAlarms() calls.
   *
   * @param customTag tag to filter alarms by
   * @param props customization options
   */
  createCompositeAlarmUsingTag(
    customTag: string,
    props?: AddCompositeAlarmProps,
  ): CompositeAlarm | undefined {
    const alarms = this.createdAlarmsWithTag(customTag);
    if (alarms.length > 0) {
      const disambiguator = props?.disambiguator ?? customTag;
      const alarmFactory = this.createAlarmFactory("Composite");
      const composite = alarmFactory.addCompositeAlarm(alarms, {
        ...(props ?? {}),
        disambiguator,
      });
      this.createdComposites.push(composite);
      return composite;
    }
    return undefined;
  }

  /**
   * Finds a subset of created alarms that are marked by a specific disambiguator and creates a composite alarm.
   * This composite alarm is created with an 'OR' condition, so it triggers with any child alarm.
   * NOTE: This composite alarm is not added among other alarms, so it is not returned by createdAlarms() calls.
   *
   * @param alarmDisambiguator disambiguator to filter alarms by
   * @param props customization options
   */
  createCompositeAlarmUsingDisambiguator(
    alarmDisambiguator: string,
    props?: AddCompositeAlarmProps,
  ): CompositeAlarm | undefined {
    const alarms = this.createdAlarmsWithDisambiguator(alarmDisambiguator);
    if (alarms.length > 0) {
      const disambiguator = props?.disambiguator ?? alarmDisambiguator;
      const alarmFactory = this.createAlarmFactory("Composite");
      const composite = alarmFactory.addCompositeAlarm(alarms, {
        ...(props ?? {}),
        disambiguator,
      });
      this.createdComposites.push(composite);
      return composite;
    }
    return undefined;
  }

  // CLONE ALARMS
  // ============

  /**
   * Applies a cloning function to each of the given alarms, creating a new collection of alarms
   * that are adjusted by the function.
   *
   * @param sourceAlarms The alarms that should be used as sources for the clones.
   * @param cloneFunction A function that will accept a source alarm and determine whether and how a new alarm should be cloned from it.
   * @returns The list of clone alarms.
   */
  cloneAlarms(
    sourceAlarms: AlarmWithAnnotation[],
    cloneFunction: AlarmCloneFunction,
  ): AlarmWithAnnotation[] {
    const cloned: AlarmWithAnnotation[] = [];
    sourceAlarms.forEach((alarm) => {
      const cloneAlarmProps = cloneFunction(alarm);
      if (cloneAlarmProps) {
        cloned.push(
          alarm.alarmDefinition.alarmFactory.addAlarm(
            alarm.alarmDefinition.metric,
            cloneAlarmProps,
          ),
        );
      }
    });
    this.createdClones.push(...cloned);
    return cloned;
  }

  // BASIC WIDGETS
  // =============

  addLargeHeader(
    text: string,
    addToSummary?: boolean,
    addToAlarm?: boolean,
  ): this {
    this.addWidget(
      new HeaderWidget(text, HeaderLevel.LARGE),
      addToSummary ?? false,
      addToAlarm ?? false,
    );
    return this;
  }

  addMediumHeader(
    text: string,
    addToSummary?: boolean,
    addToAlarm?: boolean,
  ): this {
    this.addWidget(
      new HeaderWidget(text, HeaderLevel.MEDIUM),
      addToSummary ?? false,
      addToAlarm ?? false,
    );
    return this;
  }

  addSmallHeader(
    text: string,
    addToSummary?: boolean,
    addToAlarm?: boolean,
  ): this {
    this.addWidget(
      new HeaderWidget(text, HeaderLevel.SMALL),
      addToSummary ?? false,
      addToAlarm ?? false,
    );
    return this;
  }

  addWidget(
    widget: IWidget,
    addToSummary?: boolean,
    addToAlarm?: boolean,
  ): this {
    this.addSegment(new SingleWidgetDashboardSegment(widget), {
      addToAlarmDashboard: addToAlarm ?? true,
      addToSummaryDashboard: addToSummary ?? true,
      addToDetailDashboard: true,
    });
    return this;
  }

  // RESOURCE MONITORING
  // ===================

  /**
   * Uses an aspect to automatically monitor all resources in the given scope.
   *
   * @param scope Scope with resources to monitor.
   * @param aspectProps Optional configuration.
   *
   * @experimental
   */
  monitorScope(scope: Construct, aspectProps?: MonitoringAspectProps): this {
    const aspect = new MonitoringAspect(this, aspectProps);
    Aspects.of(scope).add(aspect);
    return this;
  }

  monitorApiGateway(props: ApiGatewayMonitoringProps): this {
    const segment = new ApiGatewayMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorApiGatewayV2HttpApi(props: ApiGatewayV2HttpApiMonitoringProps): this {
    const segment = new ApiGatewayV2HttpApiMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorAppSyncApi(props: AppSyncMonitoringProps): this {
    const segment = new AppSyncMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorAuroraCluster(props: AuroraClusterMonitoringProps): this {
    const segment = new AuroraClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorCertificate(props: CertificateManagerMonitoringProps): this {
    const segment = new CertificateManagerMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorCloudFrontDistribution(
    props: CloudFrontDistributionMonitoringProps,
  ): this {
    const segment = new CloudFrontDistributionMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorCodeBuildProject(props: CodeBuildProjectMonitoringProps): this {
    const segment = new CodeBuildProjectMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorDocumentDbCluster(props: DocumentDbMonitoringProps): this {
    const segment = new DocumentDbMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorDynamoTable(props: DynamoTableMonitoringProps): this {
    const segment = new DynamoTableMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorDynamoTableGlobalSecondaryIndex(
    props: DynamoTableGlobalSecondaryIndexMonitoringProps,
  ) {
    const segment = new DynamoTableGlobalSecondaryIndexMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorEC2Instances(props: EC2MonitoringProps): this {
    const segment = new EC2Monitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorElasticsearchCluster(props: OpenSearchClusterMonitoringProps): this {
    const segment = new OpenSearchClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorOpenSearchCluster(props: OpenSearchClusterMonitoringProps): this {
    const segment = new OpenSearchClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorElastiCacheCluster(props: ElastiCacheClusterMonitoringProps): this {
    const segment = new ElastiCacheClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorGlueJob(props: GlueJobMonitoringProps): this {
    const segment = new GlueJobMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorFargateService(props: FargateServiceMonitoringProps): this {
    const segment = new FargateServiceMonitoring(this, {
      ...props,
      fargateService: props.fargateService.service,
      loadBalancer: props.fargateService.loadBalancer,
      targetGroup: props.fargateService.targetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorSimpleFargateService(
    props: SimpleFargateServiceMonitoringProps,
  ): this {
    const segment = new FargateServiceMonitoring(this, {
      ...props,
      fargateService: props.fargateService,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorFargateNetworkLoadBalancer(
    props: FargateNetworkLoadBalancerMonitoringProps,
  ): this {
    const segment = new FargateServiceMonitoring(this, {
      ...props,
      fargateService: props.fargateService,
      loadBalancer: props.networkLoadBalancer,
      targetGroup: props.networkTargetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorFargateApplicationLoadBalancer(
    props: FargateApplicationLoadBalancerMonitoringProps,
  ): this {
    const segment = new FargateServiceMonitoring(this, {
      ...props,
      fargateService: props.fargateService,
      loadBalancer: props.applicationLoadBalancer,
      targetGroup: props.applicationTargetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorEc2Service(props: Ec2ServiceMonitoringProps): this {
    const segment = new Ec2ServiceMonitoring(this, {
      ...props,
      ec2Service: props.ec2Service.service,
      loadBalancer: props.ec2Service.loadBalancer,
      targetGroup: props.ec2Service.targetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorSimpleEc2Service(props: SimpleEc2ServiceMonitoringProps): this {
    const segment = new Ec2ServiceMonitoring(this, {
      ...props,
      ec2Service: props.ec2Service,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorEc2NetworkLoadBalancer(
    props: Ec2NetworkLoadBalancerMonitoringProps,
  ): this {
    const segment = new Ec2ServiceMonitoring(this, {
      ...props,
      ec2Service: props.ec2Service,
      loadBalancer: props.networkLoadBalancer,
      targetGroup: props.networkTargetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorEc2ApplicationLoadBalancer(
    props: Ec2ApplicationLoadBalancerMonitoringProps,
  ): this {
    const segment = new Ec2ServiceMonitoring(this, {
      ...props,
      ec2Service: props.ec2Service,
      loadBalancer: props.applicationLoadBalancer,
      targetGroup: props.applicationTargetGroup,
    });
    this.addSegment(segment, props);
    return this;
  }

  monitorQueueProcessingFargateService(
    props: QueueProcessingFargateServiceMonitoringProps,
  ): this {
    getQueueProcessingFargateServiceMonitoring(this, props).forEach((segment) =>
      this.addSegment(segment),
    );
    return this;
  }

  monitorQueueProcessingEc2Service(
    props: QueueProcessingEc2ServiceMonitoringProps,
  ): this {
    getQueueProcessingEc2ServiceMonitoring(this, props).forEach((segment) =>
      this.addSegment(segment),
    );
    return this;
  }

  monitorAutoScalingGroup(props: AutoScalingGroupMonitoringProps): this {
    const segment = new AutoScalingGroupMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorKinesisFirehose(props: KinesisFirehoseMonitoringProps): this {
    const segment = new KinesisFirehoseMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorKinesisDataStream(props: KinesisDataStreamMonitoringProps): this {
    const segment = new KinesisDataStreamMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorKinesisDataAnalytics(
    props: KinesisDataAnalyticsMonitoringProps,
  ): this {
    const segment = new KinesisDataAnalyticsMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorLambdaFunction(props: LambdaFunctionMonitoringProps): this {
    const segment = new LambdaFunctionMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorNetworkLoadBalancer(props: NetworkLoadBalancerMonitoringProps): this {
    const segment = new NetworkLoadBalancerMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorRdsCluster(props: RdsClusterMonitoringProps): this {
    const segment = new RdsClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorRdsInstance(props: RdsInstanceMonitoringProps): this {
    const segment = new RdsInstanceMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorRedshiftCluster(props: RedshiftClusterMonitoringProps): this {
    const segment = new RedshiftClusterMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSecretsManager(props: SecretsManagerMonitoringProps): this {
    const segment = new SecretsManagerMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSecretsManagerSecret(
    props: SecretsManagerSecretMonitoringProps,
  ): this {
    const segment = new SecretsManagerSecretMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSnsTopic(props: SnsTopicMonitoringProps): this {
    const segment = new SnsTopicMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSqsQueue(props: SqsQueueMonitoringProps): this {
    const segment = new SqsQueueMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSqsQueueWithDlq(props: SqsQueueMonitoringWithDlqProps): this {
    const segment = new SqsQueueMonitoringWithDlq(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorStepFunction(props: StepFunctionMonitoringProps): this {
    const segment = new StepFunctionMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorStepFunctionActivity(
    props: StepFunctionActivityMonitoringProps,
  ): this {
    const segment = new StepFunctionActivityMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorStepFunctionLambdaIntegration(
    props: StepFunctionLambdaIntegrationMonitoringProps,
  ): this {
    const segment = new StepFunctionLambdaIntegrationMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorStepFunctionServiceIntegration(
    props: StepFunctionServiceIntegrationMonitoringProps,
  ): this {
    const segment = new StepFunctionServiceIntegrationMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorS3Bucket(props: S3BucketMonitoringProps): this {
    const segment = new S3BucketMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorLog(props: LogMonitoringProps): this {
    const segment = new LogMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorSyntheticsCanary(props: SyntheticsCanaryMonitoringProps): this {
    const segment = new SyntheticsCanaryMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorWebApplicationFirewallAclV2(props: WafV2MonitoringProps): this {
    const segment = new WafV2Monitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorBilling(props?: BillingMonitoringProps): this {
    const segment = new BillingMonitoring(this, props ?? {});
    this.addSegment(segment, props);
    return this;
  }

  monitorCustom(props: CustomMonitoringProps): this {
    const segment = new CustomMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }

  monitorFluentBit(props: FluentBitMonitoringProps): this {
    const segment = new FluentBitMonitoring(this, props);
    this.addSegment(segment, props);
    return this;
  }
}
