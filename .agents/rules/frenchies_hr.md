# Frenchie's HR & Desk Architecture Rules

## 🌴 PTO Accrual & Rank Cap Rules
- **Accrual Ratio**: 20 hours worked = 8 PTO hours accrued (ratio of 0.4 PTO hrs per 1 hr worked).
- **Rank-Based PTO Caps**:
  - Staff (Waiters, Hostesses, Cooks, New Hires): 80.0 hrs (2 Weeks / 10 Days).
  - Management & Leads (Managers, Chefs, HR): 120.0 hrs (3 Weeks / 15 Days).
  - Owner / Executive: 160.0 hrs (4 Weeks / 20 Days).
- **Cap Behavior**: PTO accrual pauses automatically when an employee reaches their rank cap until PTO is used. Custom overrides (`e.customPtoCap`) set by management take precedence.

## 🎨 Portal Layout & Contained Scrollbars
- **Fixed Height Containment**: Any embedded dynamic card in My Portal (e.g. Team Chat, Logs, Grids) must use a fixed container height (`height: 540px; overflow: hidden;`) so content growth does not expand the parent card or distort the page layout.
- **Custom Sliders**: Always equip scrollable sub-panels (`.chat-thread-messages`, `.chat-sidebar`) with clean `-webkit-scrollbar` styling matched to the Frenchie's theme.

## 🟢 Real-Time Presence Engine Guarantees
- **Active Client Guarantee**: `getEmpOnlineStatus(empId)` must always evaluate the currently logged-in user (`sessionUser.empId`) as **Online now** on their own client.
- **Activity Listeners**: Passive user interaction listeners (`mousemove`, `keydown`, `click`, `focus`) must refresh presence heartbeats to prevent false "Away" transitions while actively using the desk.
