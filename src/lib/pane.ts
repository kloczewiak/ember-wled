import { createContext } from 'react'

// Whether the phone tab a component sits in is showing. The phone layout keeps every tab mounted and hides the
// others with display: none, so their contents measure as zero; components that measure themselves read this to
// measure again when their tab opens. Everything outside a phone tab counts as showing.
export const PaneShown = createContext(true)
