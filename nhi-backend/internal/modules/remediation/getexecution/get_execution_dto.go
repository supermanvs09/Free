package getexecution

// GET /remediation/executions/{id} (every role)
//
// One execution of a plan (EXECUTE, ROLLBACK or FINALIZE) with its step log,
// verify result and error. The dashboard polls it while an execution runs.
// The answer is { "data": domain.Execution }.
