# Web IDE - Requirements

## User Stories

### US-1: Code Editing
As a user, I want a code editor with syntax highlighting, line numbers, and auto-indent so I can write TinyLang code comfortably in the browser.

**Acceptance Criteria:**
- Editor displays line numbers
- Keywords, strings, numbers, and comments are colored differently
- Pressing Enter auto-indents based on context
- Bracket pairs are highlighted when cursor is adjacent

### US-2: Code Execution
As a user, I want to click "Run" and see my program output in a console panel.

**Acceptance Criteria:**
- Run button executes the current file
- Output appears in the console panel
- Errors are displayed in red with line numbers
- Execution time is shown after completion

### US-3: Visual Debugging
As a user, I want to set breakpoints and step through my code visually.

**Acceptance Criteria:**
- Clicking a line number gutter toggles a breakpoint (red dot)
- Debug button starts execution and pauses at first breakpoint
- Step Over/Into/Out buttons advance execution
- Current line is highlighted during debugging
- Variable inspector shows values in the current scope

### US-4: AST Visualization
As a user, I want to see the parse tree of my code as a collapsible tree.

**Acceptance Criteria:**
- AST panel shows tree nodes for the current file
- Each node shows its type and key properties
- Nodes are collapsible/expandable
- Clicking a node highlights the corresponding source range

### US-5: Multi-file Projects
As a user, I want to create multiple files and switch between them using tabs.

**Acceptance Criteria:**
- File explorer sidebar lists all files
- Can create, rename, and delete files
- Editor shows tabs for open files
- Files persist in localStorage

### US-6: Sharing
As a user, I want to share my code via a URL.

**Acceptance Criteria:**
- Share button generates a URL with encoded project content
- Opening the URL restores the project state
- URL is copyable to clipboard

### US-7: Theming
As a user, I want to switch between dark and light themes.

**Acceptance Criteria:**
- Toggle button switches themes
- Theme preference is remembered
- Both themes have good contrast and readability

### US-8: Autocomplete
As a user, I want keyword and stdlib function suggestions as I type.

**Acceptance Criteria:**
- Typing triggers an autocomplete dropdown
- Dropdown shows matching keywords and stdlib functions
- Tab or Enter selects a suggestion
- Escape dismisses the dropdown
