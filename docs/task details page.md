<center> ^ </center>

---
[ ] Task 1  <br>
┌─────────────────────┐

 Task details text box

└─────────────────────┘
<center>------- Blockers -------</center>

[ ] task 2 <br>
[ ] task 3

<center>+ Blocker</center>


<center>------- Snooze -------</center>
<center>Mar 17, 12:34 PM</center>
<center>(Clear Snooze)</center>

---

Notes: 
- the back button ^ sticks to the top always. Always goes back to task list.
- task name and blockers can be competed from this screen.
- A red box with X will be in the top right corner, not displayed on mockup. This is the delete button.
- Snooze section: three preset buttons (1 Hour, 1 Day, 1 Week) + "Pick date" button. All auto-save instantly.
- Clicking a preset or "Pick date" expands to show native datetime-local picker + "Clear Snooze" button.
- Presets update the picker value. Picker changes auto-save. "Clear Snooze" wakes the task and collapses the section.
- Clicking + blocker will open a in-line area with search bar, displaying the 5 top tasks by default.
  - the page will scroll down to have blocked on top of the page unless the whole thing page fits anyway.
    - other than the back button
  - adding search will display matching open task in what ever order the backend decides (mongo search rank), max 5
  - there will always be a new task option, which acts the same as the new task button on the task list page, but will auto link the two task (new one blocking the old one).
  
