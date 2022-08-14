import { App, CustomResource, Duration, Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib'
import { aws_lambda as lambda } from 'aws-cdk-lib'
import { aws_dynamodb as ddb } from 'aws-cdk-lib'
import { aws_sns as sns } from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3n from 'aws-cdk-lib/aws-s3-notifications'
import { aws_sns_subscriptions as subscriptions } from 'aws-cdk-lib'
import { aws_iam as iam } from 'aws-cdk-lib'
import { aws_stepfunctions as stepfunctions } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as path from 'path'

import { CLQSCalculatorStack } from './calculator/carbonlake-qs-calculator'
import { CLQSStatemachineStack } from './statemachine/carbonlake-qs-statemachine-stack'
import { CarbonLakeGlueTransformationStack } from './transform/glue/carbonlake-qs-glue-transform-job'
import { CarbonlakeDataQualityStack } from './data-quality/carbonlake-qs-data-quality'

interface PipelineProps extends StackProps {
  dataLineageFunction: lambda.Function
  errorBucket: s3.Bucket
  rawBucket: s3.Bucket
  transformedBucket: s3.Bucket
  enrichedBucket: s3.Bucket
  notificationEmailAddress: string
}

export class CLQSPipelineStack extends Stack {
  public readonly carbonlakeLandingBucket: s3.Bucket
  public readonly calculatorOutputTable: ddb.Table
  public readonly calculatorFunction: lambda.Function
  public readonly pipelineStateMachine: stepfunctions.StateMachine

  constructor(scope: Construct, id: string, props: PipelineProps) {
    super(scope, id, props)

    // Landing bucket where files are dropped by customers
    // Once processed, the files are removed by the pipeline
    this.carbonlakeLandingBucket = new s3.Bucket(this, 'carbonlakeLandingBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          exposedHeaders: ['x-amz-server-side-encryption', 'x-amz-request-id', 'x-amz-id-2', 'ETag'],
          maxAge: 3000,
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    })

    /* ======== DATA QUALITY ======== */
    const { resourcesLambda, resultsLambda } = new CarbonlakeDataQualityStack(this, 'carbonlakeDataQualityStack', {
      inputBucket: this.carbonlakeLandingBucket,
      outputBucket: props.rawBucket,
      errorBucket: props.errorBucket,
    })

    const dqErrorNotificationSNS = new sns.Topic(this, 'carbonlakeDataQualityNotification', {})
    const dqEmailSubscription = new subscriptions.EmailSubscription(props.notificationEmailAddress)
    dqErrorNotificationSNS.addSubscription(dqEmailSubscription)

    /* ======== GLUE TRANSFORM ======== */
    // TODO: how should this object be instantiated? Should CarbonLakeGlueTransformationStack return the necessary glue jobs?
    const { glueTransformJobName } = new CarbonLakeGlueTransformationStack(this, 'CLQSGlueTransformationStack', {
      rawBucket: props?.rawBucket,
      transformedBucket: props?.transformedBucket,
    })

    /* ======== POST-GLUE BATCH LAMBDA ======== */

    // Lambda Layer for aws_lambda_powertools (dependency for the lambda function)
    const dependencyLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'carbonlakePipelineDependencyLayer',
      `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPython:18`
    )

    // Lambda function to list total objects in the directory created by AWS Glue
    const batchEnumLambda = new lambda.Function(this, 'carbonlakePipelineBatchLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset(path.join(__dirname, './lambda/batch_enum_lambda/')),
      handler: 'app.lambda_handler',
      layers: [dependencyLayer],
      timeout: Duration.seconds(60),
      environment: {
        TRANSFORMED_BUCKET_NAME: props.transformedBucket.bucketName,
      },
    })

    props.transformedBucket.grantRead(batchEnumLambda)

    /* ======== CALCULATION ======== */

    const { calculatorLambda, calculatorOutputTable } = new CLQSCalculatorStack(this, 'CarbonlakeCalculatorStack', {
      transformedBucket: props.transformedBucket,
      enrichedBucket: props.enrichedBucket,
    })
    this.calculatorOutputTable = calculatorOutputTable
    this.calculatorFunction = calculatorLambda

    /* ======== STATEMACHINE ======== */

    // Required inputs for the step function
    //  - data lineage lambda function
    //  - dq quality workflow
    //  - glue transformation job
    //  - calculation function
    const { statemachine } = new CLQSStatemachineStack(this, 'CLQSStatemachineStack', {
      dataLineageFunction: props?.dataLineageFunction,
      dqResourcesLambda: resourcesLambda,
      dqResultsLambda: resultsLambda,
      dqErrorNotification: dqErrorNotificationSNS,
      glueTransformJobName: glueTransformJobName,
      batchEnumLambda: batchEnumLambda,
      calculationJob: calculatorLambda,
    })
    this.pipelineStateMachine = statemachine

    /* ======== KICKOFF LAMBDA ======== */

    // Lambda function to process incoming events, generate child node IDs and start the step function
    const kickoffFunction = new lambda.Function(this, 'carbonlakePipelineKickoffLambda', {
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset(path.join(__dirname, './lambda/pipeline_kickoff/')),
      handler: 'app.lambda_handler',
      layers: [dependencyLayer],
      environment: {
        LANDING_BUCKET_NAME: this.carbonlakeLandingBucket.bucketName,
        STATEMACHINE_ARN: statemachine.stateMachineArn,
      },
    })
    statemachine.grantStartExecution(kickoffFunction)

    // Invoke kickoff lambda function every time an object is created in the bucket
    this.carbonlakeLandingBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(kickoffFunction)
      // optional: only invoke lambda if object matches the filter
      // {prefix: 'test/', suffix: '.yaml'},
    )
  }
}
