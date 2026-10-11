{
  "Comment": "Settle one prediction after its server deadline",
  "StartAt": "WaitForDeadline",
  "TimeoutSeconds": 21600,
  "States": {
    "WaitForDeadline": {
      "Type": "Wait",
      "TimestampPath": "$.dueAt",
      "Next": "Resolve"
    },
    "Resolve": {
      "Type": "Task",
      "Resource": "RESOLVE_FUNCTION_ARN",
      "Parameters": {
        "playerId.$": "$.playerId",
        "predictionId.$": "$.predictionId",
        "dueAt.$": "$.dueAt",
        "executionName.$": "$$.Execution.Name"
      },
      "Retry": [
        {
          "ErrorEquals": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException",
            "Lambda.TooManyRequestsException",
            "States.TaskFailed"
          ],
          "IntervalSeconds": 2,
          "BackoffRate": 2,
          "MaxAttempts": 6
        }
      ],
      "Next": "AfterResolve"
    },
    "AfterResolve": {
      "Type": "Choice",
      "Choices": [
        { "Variable": "$.status", "StringEquals": "SETTLED", "Next": "Done" },
        { "Variable": "$.status", "StringEquals": "ALREADY_SETTLED", "Next": "Done" },
        { "Variable": "$.status", "StringEquals": "ORPHANED", "Next": "Done" },
        { "Variable": "$.status", "StringEquals": "EQUAL_PRICE", "Next": "WaitEqual" },
        { "Variable": "$.status", "StringEquals": "PROVIDER_HOLD", "Next": "WaitProvider" },
        { "Variable": "$.status", "StringEquals": "TOO_EARLY", "Next": "WaitForDeadline" }
      ],
      "Default": "UnexpectedStatus"
    },
    "WaitEqual": {
      "Type": "Wait",
      "Seconds": 5,
      "Next": "Resolve"
    },
    "WaitProvider": {
      "Type": "Wait",
      "Seconds": 15,
      "Next": "Resolve"
    },
    "Done": {
      "Type": "Succeed"
    },
    "UnexpectedStatus": {
      "Type": "Fail",
      "Error": "UnexpectedStatus",
      "Cause": "Resolver returned an unknown status"
    }
  }
}
