package engine

import (
	"fmt"

	"learning/internal/rules"
)

// The strict university flow asks the learner, once the diagnosis settles, how
// to be taught. The answer is not a stage with artifacts: it is one recorded
// choice that opens planning.
const (
	stageMethod        = "method"
	methodPareto       = "pareto"
	methodPreferencias = "preferencias"
)

func methodPending() Check {
	return failCheck("method-chosen",
		"the learner has not chosen how to be taught yet: ask pareto or preferencias and record it with the method command")
}

// runMethod records the learner's explanation method. It is accepted only in a
// strict-flow run, once, right after the diagnosis; pareto also trims the run
// to the pareto scope. A refused choice leaves the state untouched.
func runMethod(ws string, r *rules.Rules, method string) (Report, int) {
	if !r.Thresholds.StrictFlow {
		return errorReport("this run does not ask for a method: its rules predate the strict university flow"), ExitOperational
	}
	release, err := acquireLock(ws)
	if err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	defer release()
	st, err := loadState(ws)
	if err != nil {
		return blocked([]Check{failCheck("state-initialized", err.Error())},
			r.StageOrder[0], r.StageOrder[0], "", ExitFailedCheck)
	}
	fStage, fPart, _ := frontier(r, st, ws)
	if fStage != stageMethod {
		reason := fmt.Sprintf("the method is chosen right after the diagnosis; the run is at %s", fStage)
		if st.Method != "" {
			reason = "the method is already chosen: " + st.Method
		}
		rep, code := blocked([]Check{failCheck("method-due", reason)}, fStage, fStage, fPart, ExitFailedCheck)
		rep.Method = st.Method
		return rep, code
	}
	st.Method = method
	if method == methodPareto {
		st.Scope = scopePareto
	}
	if err := saveState(ws, st); err != nil {
		return errorReport(err.Error()), ExitOperational
	}
	next, part, _ := frontier(r, st, ws)
	return Report{
		Status:    "accepted",
		Stage:     stageMethod,
		NextStage: next,
		Part:      part,
		Scope:     stateScope(st),
		Method:    method,
		Checks:    []Check{passCheck("method-chosen", "the learner chose "+method)},
	}, ExitOK
}
