; Custom NSIS installer page for VersAgent
; Uses electron-builder's customHeader hook to add a configuration page

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; Override electron-builder's default app running check
; This prevents the installer from automatically prompting to close the app
; and killing it *before* the uninstaller gets to ask for the password.
!macro customCheckAppRunning
  ; Do nothing but prevent NSIS from treating it as empty
  Push $0
  Pop $0
!macroend

; Declare variables
Var Dialog
Var CategoryDropdown
Var Field1Label
Var Field1Input
Var Field2Label
Var Field2Input
Var CategoryValue
Var Field1Value
Var Field2Value
Var DescLabel
Var ServerUrlLabel
Var ServerUrlInput
Var ServerUrlValue
Var DbServerLabel
Var DbServerInput
Var DbServerValue
; v1.0.87: Pre-fill variables for Department/Location/Family from registry
Var RegDepartment
Var RegLocation
Var RegFamily



; Page creation function
Function ConfigPage
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Default values
  StrCpy $CategoryValue "Unassigned"
  StrCpy $ServerUrlValue "https://10.71.12.140:3002/api"
  StrCpy $DbServerValue "EUMOOUJ-DB01"
  StrCpy $RegDepartment ""
  StrCpy $RegLocation ""
  StrCpy $RegFamily ""

  ; Try to pre-fill from existing config in INSTDIR if it exists
  IfFileExists "$INSTDIR\setup-config.json" 0 NoExistingConfig
    
    ; Create a temporary PowerShell script to read the config
    FileOpen $0 "$TEMP\aptiv-read-config.ps1" w
    ${If} $0 != ""
      FileWrite $0 "$\r$\n$$ErrorActionPreference = 'SilentlyContinue'$\r$\n"
      FileWrite $0 "$$config = Get-Content -Raw '$$env:ProgramFiles\VersAgent\setup-config.json' | ConvertFrom-Json$\r$\n"
      
      FileWrite $0 "$$serverUrl = $$config.serverUrl$\r$\n"
      FileWrite $0 "if ($$serverUrl) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-server.txt', $$serverUrl) }$\r$\n"
      
      FileWrite $0 "$$dbServer = $$config.dbServer$\r$\n"
      FileWrite $0 "if ($$dbServer) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-db.txt', $$dbServer) }$\r$\n"
      
      FileWrite $0 "$$category = $$config.category$\r$\n"
      FileWrite $0 "if ($$category) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-cat.txt', $$category) }$\r$\n"
      ; v1.0.88 FIX: Also read department/location/family from existing config
      FileWrite $0 "$$dept = $$config.department$\r$\n"
      FileWrite $0 "if ($$dept) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-dept.txt', $$dept) }$\r$\n"
      FileWrite $0 "$$loc = $$config.location$\r$\n"
      FileWrite $0 "if ($$loc) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-loc.txt', $$loc) }$\r$\n"
      FileWrite $0 "$$fam = $$config.family$\r$\n"
      FileWrite $0 "if ($$fam) { [IO.File]::WriteAllText('$$env:TEMP\aptiv-fam.txt', $$fam) }$\r$\n"
      
      FileClose $0
      
      ; Execute the script silently
      nsExec::Exec 'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\aptiv-read-config.ps1"'
      
      ; Read Server URL back
      IfFileExists "$TEMP\aptiv-server.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-server.txt" r
        FileRead $1 $ServerUrlValue
        FileClose $1
        
      ; Read DB Server back
      IfFileExists "$TEMP\aptiv-db.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-db.txt" r
        FileRead $1 $DbServerValue
        FileClose $1
        
      ; Read Category back
      IfFileExists "$TEMP\aptiv-cat.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-cat.txt" r
        FileRead $1 $CategoryValue
        FileClose $1

      ; v1.0.88 FIX: Read department/location/family back from existing config
      IfFileExists "$TEMP\aptiv-dept.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-dept.txt" r
        FileRead $1 $RegDepartment
        FileClose $1
      IfFileExists "$TEMP\aptiv-loc.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-loc.txt" r
        FileRead $1 $RegLocation
        FileClose $1
      IfFileExists "$TEMP\aptiv-fam.txt" 0 +3
        FileOpen $1 "$TEMP\aptiv-fam.txt" r
        FileRead $1 $RegFamily
        FileClose $1
        
      ; Cleanup
      Delete "$TEMP\aptiv-read-config.ps1"
      Delete "$TEMP\aptiv-server.txt"
      Delete "$TEMP\aptiv-db.txt"
      Delete "$TEMP\aptiv-cat.txt"
      Delete "$TEMP\aptiv-dept.txt"
      Delete "$TEMP\aptiv-loc.txt"
      Delete "$TEMP\aptiv-fam.txt"
    ${EndIf}
    
  NoExistingConfig:

  ; Try Registry First (Best fallback if file missing)
  ${If} $ServerUrlValue == "https://10.71.12.140:3002/api"
    ReadRegStr $0 HKLM "Software\VersAgent" "ServerUrl"
    ${If} $0 != ""
      StrCpy $ServerUrlValue $0
    ${EndIf}
  ${EndIf}

  ${If} $DbServerValue == "EUMOOUJ-DB01"
    ReadRegStr $0 HKLM "Software\VersAgent" "DbServer"
    ${If} $0 != ""
      StrCpy $DbServerValue $0
    ${EndIf}
  ${EndIf}

  ${If} $CategoryValue == "Unassigned"
    ReadRegStr $0 HKLM "Software\VersAgent" "Category"
    ${If} $0 != ""
      StrCpy $CategoryValue $0
    ${EndIf}
  ${EndIf}

  ; v1.0.87 FIX: Also read Department, Location, Family from registry for pre-fill
  ReadRegStr $0 HKLM "Software\VersAgent" "Department"
  ${If} $0 != ""
    StrCpy $RegDepartment $0
  ${EndIf}
  ReadRegStr $0 HKLM "Software\VersAgent" "Location"
  ${If} $0 != ""
    StrCpy $RegLocation $0
  ${EndIf}
  ReadRegStr $0 HKLM "Software\VersAgent" "Family"
  ${If} $0 != ""
    StrCpy $RegFamily $0
  ${EndIf}

  ; CRITICAL FIX: Ensure values NEVER become completely blank
  ${If} $CategoryValue == ""
    StrCpy $CategoryValue "Unassigned"
  ${EndIf}
  ${If} $ServerUrlValue == ""
    StrCpy $ServerUrlValue "https://10.71.12.140:3002/api"
  ${EndIf}
  ${If} $DbServerValue == ""
    StrCpy $DbServerValue "EUMOOUJ-DB01"
  ${EndIf}

  ; Title description
  ${NSD_CreateLabel} 0 0 100% 24u "Configure this PC's connection and category:"
  Pop $DescLabel

  ; Server URL (HIDDEN v1.0.99)
  ${NSD_CreateLabel} 0 1000u 14u 14u "Server URL:"
  Pop $ServerUrlLabel
  ShowWindow $ServerUrlLabel 0
  ${NSD_CreateText} 0 1000u 14u 14u "$ServerUrlValue"
  Pop $ServerUrlInput
  ShowWindow $ServerUrlInput 0

  ; DB Server (HIDDEN v1.0.99)
  ${NSD_CreateLabel} 0 1000u 14u 14u "DB Server:"
  Pop $DbServerLabel
  ShowWindow $DbServerLabel 0
  ${NSD_CreateText} 0 1000u 14u 14u "$DbServerValue"
  Pop $DbServerInput
  ShowWindow $DbServerInput 0

  ; Category dropdown (Shifted UP)
  ${NSD_CreateLabel} 0 32u 80u 14u "Category:"
  Pop $0
  ${NSD_CreateDropList} 90u 30u 200u 120u ""
  Pop $CategoryDropdown
  ${NSD_CB_AddString} $CategoryDropdown "Unassigned"
  ${NSD_CB_AddString} $CategoryDropdown "User"
  ${NSD_CB_AddString} $CategoryDropdown "Shopfloor"
  ${NSD_CB_AddString} $CategoryDropdown "Kiosk"
  ${NSD_CB_AddString} $CategoryDropdown "Server"
  ${NSD_CB_AddString} $CategoryDropdown "Network"
  ${NSD_CB_AddString} $CategoryDropdown "Other"
  ${NSD_CB_SelectString} $CategoryDropdown "$CategoryValue"
  ${NSD_OnChange} $CategoryDropdown OnCategoryChanged

  ; Field 1 (dynamic label + input, Shifted UP)
  ${NSD_CreateLabel} 0 56u 80u 14u ""
  Pop $Field1Label
  ${NSD_CreateText} 90u 54u 200u 14u ""
  Pop $Field1Input
  ShowWindow $Field1Label 0
  ShowWindow $Field1Input 0

  ; Field 2 (dynamic label + input, Shifted UP)
  ${NSD_CreateLabel} 0 76u 80u 14u ""
  Pop $Field2Label
  ${NSD_CreateText} 90u 74u 200u 14u ""
  Pop $Field2Input
  ShowWindow $Field2Label 0
  ShowWindow $Field2Input 0

  ; v1.0.87 FIX: Pre-fill sub-fields from registry on updates
  ${If} $CategoryValue == "User"
    ${NSD_SetText} $Field1Label "Department:"
    ${NSD_SetText} $Field2Label "Location:"
    ${NSD_SetText} $Field1Input "$RegDepartment"
    ${NSD_SetText} $Field2Input "$RegLocation"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 1
    ShowWindow $Field2Input 1
  ${ElseIf} $CategoryValue == "Shopfloor"
    ${NSD_SetText} $Field1Label "Location:"
    ${NSD_SetText} $Field2Label "Family:"
    ${NSD_SetText} $Field1Input "$RegLocation"
    ${NSD_SetText} $Field2Input "$RegFamily"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 1
    ShowWindow $Field2Input 1
  ${ElseIf} $CategoryValue == "Kiosk"
    ${NSD_SetText} $Field1Label "Location:"
    ${NSD_SetText} $Field1Input "$RegLocation"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 0
    ShowWindow $Field2Input 0
  ${EndIf}

  nsDialogs::Show
FunctionEnd

; Callback when category changes
Function OnCategoryChanged
  Pop $0
  ${NSD_GetText} $CategoryDropdown $CategoryValue

  ; Clear fields first
  ${NSD_SetText} $Field1Input ""
  ${NSD_SetText} $Field2Input ""

  ${If} $CategoryValue == "User"
    ${NSD_SetText} $Field1Label "Department:"
    ${NSD_SetText} $Field2Label "Location:"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 1
    ShowWindow $Field2Input 1
  ${ElseIf} $CategoryValue == "Shopfloor"
    ${NSD_SetText} $Field1Label "Location:"
    ${NSD_SetText} $Field2Label "Family:"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 1
    ShowWindow $Field2Input 1
  ${ElseIf} $CategoryValue == "Kiosk"
    ${NSD_SetText} $Field1Label "Location:"
    ShowWindow $Field1Label 1
    ShowWindow $Field1Input 1
    ShowWindow $Field2Label 0
    ShowWindow $Field2Input 0
  ${Else}
    ShowWindow $Field1Label 0
    ShowWindow $Field1Input 0
    ShowWindow $Field2Label 0
    ShowWindow $Field2Input 0
  ${EndIf}
FunctionEnd

; Page leave callback - save values AND write config immediately while controls exist
Function ConfigPageLeave
  ${NSD_GetText} $CategoryDropdown $CategoryValue
  ${NSD_GetText} $Field1Input $Field1Value
  ${NSD_GetText} $Field2Input $Field2Value

  ; CRITICAL FIX v1.0.55: Write JSON step-by-step to avoid string expansion issues or corruption
  ; v1.0.88 FIX: Always include department/location/family so they persist across updates
  FileOpen $0 "$TEMP\aptiv-setup-config.json" w
  ${If} $0 != ""
    FileWrite $0 '{"serverUrl":"'
    FileWrite $0 '$ServerUrlValue'
    FileWrite $0 '","dbServer":"'
    FileWrite $0 '$DbServerValue'
    FileWrite $0 '","category":"'
    FileWrite $0 '$CategoryValue'

    ; Write department/location/family based on category mapping
    ; Field1/Field2 have different meanings per category, so map correctly
    ; and fall back to $RegDepartment/$RegLocation/$RegFamily for fields not shown in UI
    ${If} $CategoryValue == "User"
      ; User: Field1=Department, Field2=Location
      FileWrite $0 '","department":"'
      FileWrite $0 '$Field1Value'
      FileWrite $0 '","location":"'
      FileWrite $0 '$Field2Value'
      FileWrite $0 '","family":"'
      FileWrite $0 '$RegFamily'
    ${ElseIf} $CategoryValue == "Shopfloor"
      ; Shopfloor: Field1=Location, Field2=Family
      FileWrite $0 '","department":"'
      FileWrite $0 '$RegDepartment'
      FileWrite $0 '","location":"'
      FileWrite $0 '$Field1Value'
      FileWrite $0 '","family":"'
      FileWrite $0 '$Field2Value'
    ${ElseIf} $CategoryValue == "Kiosk"
      ; Kiosk: Field1=Location
      FileWrite $0 '","department":"'
      FileWrite $0 '$RegDepartment'
      FileWrite $0 '","location":"'
      FileWrite $0 '$Field1Value'
      FileWrite $0 '","family":"'
      FileWrite $0 '$RegFamily'
    ${Else}
      ; All other categories: carry over existing values from registry
      FileWrite $0 '","department":"'
      FileWrite $0 '$RegDepartment'
      FileWrite $0 '","location":"'
      FileWrite $0 '$RegLocation'
      FileWrite $0 '","family":"'
      FileWrite $0 '$RegFamily'
    ${EndIf}

    FileWrite $0 '"}'
    FileClose $0
  ${EndIf}

  ; Also write a trace file for debugging
  FileOpen $1 "C:\aptiv_installer_trace.txt" w
  ${If} $1 != ""
    FileWrite $1 "ConfigPageLeave called at: $TEMP$\r$\n"
    FileWrite $1 "ServerUrl: $ServerUrlValue$\r$\n"
    FileWrite $1 "DbServer: $DbServerValue$\r$\n"
    FileWrite $1 "Category: $CategoryValue$\r$\n"
    FileWrite $1 "Field1: $Field1Value$\r$\n"
    FileWrite $1 "Field2: $Field2Value$\r$\n"
    FileClose $1
  ${EndIf}

  ; v1.0.66 FIX: Write ALL metadata to Registry (Bridge)
  WriteRegStr HKLM "Software\VersAgent" "Category" "$CategoryValue"
  WriteRegStr HKLM "Software\VersAgent" "ServerUrl" "$ServerUrlValue"
  WriteRegStr HKLM "Software\VersAgent" "DbServer" "$DbServerValue"
  WriteRegStr HKLM "Software\VersAgent" "RejectUnauthorized" "0" ; Default to 0 (bypass SSL) for internal
  
  ; Write category-specific metadata
  ${If} $CategoryValue == "User"
    WriteRegStr HKLM "Software\VersAgent" "Department" "$Field1Value"
    WriteRegStr HKLM "Software\VersAgent" "Location" "$Field2Value"
    WriteRegStr HKLM "Software\VersAgent" "Family" ""
  ${ElseIf} $CategoryValue == "Shopfloor"
    WriteRegStr HKLM "Software\VersAgent" "Department" ""
    WriteRegStr HKLM "Software\VersAgent" "Location" "$Field1Value"
    WriteRegStr HKLM "Software\VersAgent" "Family" "$Field2Value"
  ${ElseIf} $CategoryValue == "Kiosk"
    WriteRegStr HKLM "Software\VersAgent" "Department" ""
    WriteRegStr HKLM "Software\VersAgent" "Location" "$Field1Value"
    WriteRegStr HKLM "Software\VersAgent" "Family" ""
  ${Else}
    WriteRegStr HKLM "Software\VersAgent" "Department" ""
    WriteRegStr HKLM "Software\VersAgent" "Location" ""
    WriteRegStr HKLM "Software\VersAgent" "Family" ""
  ${EndIf}

  ; File fallback
  SetOutPath $INSTDIR
  Delete "$INSTDIR\setup-config.json"
  CopyFiles /SILENT "$TEMP\aptiv-setup-config.json" "$INSTDIR\setup-config.json"
FunctionEnd
; v1.0.65 FIX: Define the page at the GLOBAL scope at the top of the file
; This is the most reliable way to force it to the front of the page list
Page custom ConfigPage ConfigPageLeave

; Also include it in customPage as a fallback for some builder versions
!macro customPage
  Page custom ConfigPage ConfigPageLeave
!macroend

; Hook: Add custom page early
!macro customHeader
  ; (Variable declarations and logic go here if needed)
!macroend

; Hook: Write config file after install
!macro customInstall
  ; Force kill running instances to ensure we can write files and that the new version starts fresh
  DetailPrint "Stopping existing VersAgent instances..."
  nsExec::ExecToLog 'taskkill /F /IM "VersAgent.exe" /T'
  Sleep 1000

  ; CRITICAL FIX v1.0.62: Explicitly delete any existing setup-config.json FIRST
  ; to ensure we don't have stale/locked files preventing the new write.
  Delete "$INSTDIR\setup-config.json"
  Sleep 500

  IfFileExists "$TEMP\aptiv-setup-config.json" 0 +4
    CopyFiles /SILENT "$TEMP\aptiv-setup-config.json" "$INSTDIR\setup-config.json"
    DetailPrint "Successfully copied setup-config.json to $INSTDIR"
    Goto ConfigDone

  ; Fallback: if temp file doesn't exist, write directly (may have empty vars)
  DetailPrint "WARNING: Temp config not found, writing directly with current vars..."
  FileOpen $0 "$INSTDIR\setup-config.json" w
  ${If} $0 != ""
    FileWrite $0 '{"serverUrl":"$ServerUrlValue","dbServer":"$DbServerValue","category":"$CategoryValue"}'
    FileClose $0
  ${EndIf}

  ConfigDone:

  ; v1.0.89 FIX: Create an elevated Scheduled Task that launches the agent automatically on user logon.
  ; By using XML, we can target the S-1-5-32-545 (BUILTIN\Users) group and explicitly set HighestAvailable.
  DetailPrint "Configuring stealth auto-start service..."
  
  ; First gently remove any existing task just in case it's an update
  nsExec::ExecToLog 'schtasks /Delete /TN "VersAgent" /F'
  ; Cleanup leftover dev/test tasks that may launch notepad on logon
  nsExec::ExecToLog 'schtasks /Delete /TN "TestAgentTask" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "TestAutoStart" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "AptivAgentTest" /F'
  ; Also remove old watchdog if updating
  nsExec::ExecToLog 'schtasks /Delete /TN "VersAgent Watchdog" /F'
  Sleep 1000

  ; Use PowerShell to write the XML template to a temp file, then import it
  FileOpen $0 "$TEMP\aptiv_task.xml" w
  FileWrite $0 `<?xml version="1.0" encoding="UTF-16"?>$\r$\n`
  FileWrite $0 `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">$\r$\n`
  FileWrite $0 `  <Triggers>$\r$\n`
  FileWrite $0 `    <LogonTrigger>$\r$\n`
  FileWrite $0 `      <Enabled>true</Enabled>$\r$\n`
  FileWrite $0 `    </LogonTrigger>$\r$\n`
  FileWrite $0 `  </Triggers>$\r$\n`
  FileWrite $0 `  <Principals>$\r$\n`
  FileWrite $0 `    <Principal id="Author">$\r$\n`
  FileWrite $0 `      <GroupId>S-1-5-32-545</GroupId>$\r$\n`
  FileWrite $0 `      <RunLevel>LeastPrivilege</RunLevel>$\r$\n`
  FileWrite $0 `    </Principal>$\r$\n`
  FileWrite $0 `  </Principals>$\r$\n`
  FileWrite $0 `  <Settings>$\r$\n`
  FileWrite $0 `    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>$\r$\n`
  FileWrite $0 `    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>$\r$\n`
  FileWrite $0 `    <Hidden>true</Hidden>$\r$\n`
  FileWrite $0 `  </Settings>$\r$\n`
  FileWrite $0 `  <Actions Context="Author">$\r$\n`
  FileWrite $0 `    <Exec>$\r$\n`
  FileWrite $0 `      <Command>$INSTDIR\VersAgent.exe</Command>$\r$\n`
  FileWrite $0 `      <Arguments>--hidden</Arguments>$\r$\n`
  FileWrite $0 `      <WorkingDirectory>$INSTDIR</WorkingDirectory>$\r$\n`
  FileWrite $0 `    </Exec>$\r$\n`
  FileWrite $0 `  </Actions>$\r$\n`
  FileWrite $0 `</Task>$\r$\n`
  FileClose $0

  ; Create the Logon task from XML
  nsExec::ExecToLog 'schtasks /Create /TN "VersAgent" /XML "$TEMP\aptiv_task.xml" /F'
  Delete "$TEMP\aptiv_task.xml"

  ; v1.1.17: Watchdog — completely invisible using wscript.exe + VBS wrapper
  ; powershell.exe is a console-subsystem app and ALWAYS creates a visible window.
  ; wscript.exe is GUI-subsystem and never creates a window. The VBS wrapper launches
  ; PowerShell with WScript.Shell.Run style=0 (fully hidden).
  DetailPrint "Configuring agent watchdog..."

  ; STEP 1: Write the PowerShell watchdog script to the install directory
  FileOpen $0 "$INSTDIR\watchdog.ps1" w
  FileWrite $0 "while ($$true) {$\r$\n"
  FileWrite $0 "    if (-not (Get-Process 'VersAgent' -ErrorAction SilentlyContinue)) {$\r$\n"
  FileWrite $0 "        Start-Process (Join-Path $$PSScriptRoot 'VersAgent.exe') -ArgumentList '--hidden' -WindowStyle Hidden$\r$\n"
  FileWrite $0 "    }$\r$\n"
  FileWrite $0 "    Start-Sleep -Seconds 300$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0

  ; STEP 2: Write the VBS launcher that runs PowerShell invisibly (window style 0 = hidden)
  ; Uses Chr(34) in VBS for double-quote to avoid NSIS escaping hell
  FileOpen $0 "$INSTDIR\watchdog.vbs" w
  FileWrite $0 `Set WshShell = CreateObject("WScript.Shell")$\r$\n`
  FileWrite $0 `WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoLogo -NonInteractive -WindowStyle Hidden -File " & Chr(34) & "$INSTDIR\watchdog.ps1" & Chr(34), 0, True$\r$\n`
  FileClose $0

  ; STEP 3: Scheduled task now runs wscript.exe (GUI subsystem = zero console windows)
  FileOpen $0 "$TEMP\aptiv_watchdog.xml" w
  FileWrite $0 `<?xml version="1.0" encoding="UTF-16"?>$\r$\n`
  FileWrite $0 `<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">$\r$\n`
  FileWrite $0 `  <Triggers>$\r$\n`
  FileWrite $0 `    <LogonTrigger>$\r$\n`
  FileWrite $0 `      <Enabled>true</Enabled>$\r$\n`
  FileWrite $0 `      <Delay>PT2M</Delay>$\r$\n`
  FileWrite $0 `    </LogonTrigger>$\r$\n`
  FileWrite $0 `  </Triggers>$\r$\n`
  FileWrite $0 `  <Principals>$\r$\n`
  FileWrite $0 `    <Principal id="Author">$\r$\n`
  FileWrite $0 `      <GroupId>S-1-5-32-545</GroupId>$\r$\n`
  FileWrite $0 `      <RunLevel>LeastPrivilege</RunLevel>$\r$\n`
  FileWrite $0 `    </Principal>$\r$\n`
  FileWrite $0 `  </Principals>$\r$\n`
  FileWrite $0 `  <Settings>$\r$\n`
  FileWrite $0 `    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>$\r$\n`
  FileWrite $0 `    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>$\r$\n`
  FileWrite $0 `    <Hidden>true</Hidden>$\r$\n`
  FileWrite $0 `    <RestartOnFailure>$\r$\n`
  FileWrite $0 `      <Interval>PT5M</Interval>$\r$\n`
  FileWrite $0 `      <Count>999</Count>$\r$\n`
  FileWrite $0 `    </RestartOnFailure>$\r$\n`
  FileWrite $0 `  </Settings>$\r$\n`
  FileWrite $0 `  <Actions Context="Author">$\r$\n`
  FileWrite $0 `    <Exec>$\r$\n`
  FileWrite $0 `      <Command>wscript.exe</Command>$\r$\n`
  FileWrite $0 `      <Arguments>"$INSTDIR\watchdog.vbs"</Arguments>$\r$\n`
  FileWrite $0 `      <WorkingDirectory>$INSTDIR</WorkingDirectory>$\r$\n`
  FileWrite $0 `    </Exec>$\r$\n`
  FileWrite $0 `  </Actions>$\r$\n`
  FileWrite $0 `</Task>$\r$\n`
  FileClose $0

  nsExec::ExecToLog 'schtasks /Create /TN "VersAgent Watchdog" /XML "$TEMP\aptiv_watchdog.xml" /F'
  Delete "$TEMP\aptiv_watchdog.xml"
  DetailPrint "Watchdog task configured."

  ; Verify the task was actually created
  DetailPrint "Verifying auto-start task..."
  nsExec::ExecToLog 'schtasks /Query /TN "VersAgent"'
  
  ; Npcap Installation Check
  ; Check if wpcap.dll exists in System32 (standard location for Npcap/WinPcap)
  IfFileExists "$SYSDIR\wpcap.dll" +3 0
    DetailPrint "Npcap not found. Installing Npcap..."
    ; v1.0.74 FIX: Removed /S because free version of Npcap blocks silent installation with a popup error.
    ; /admin_only=no (allows standard users to capture), /loopback_support=no (prevents kiosk wifi conflicts)
    ExecWait '"$INSTDIR\resources\resources\npcap-installer.exe" /winpcap_mode=yes /admin_only=no /loopback_support=no'

  ; v1.2.1: Run the app with --first-run so it shows a "please restart" tray balloon
  ; and exits immediately instead of attempting to start services before a reboot.
  ; Npcap drivers and Scheduled Tasks are not active until after a restart on Autopilot.
  DetailPrint "Installation complete. Notifying user to restart..."
  Exec '"$INSTDIR\VersAgent.exe" --first-run'


!macroend

; Hook: Password protection on uninstall
!macro customUnInstall
  DetailPrint "Removing stealth auto-start service..."
  nsExec::ExecToLog 'schtasks /Delete /TN "VersAgent" /F'
  nsExec::ExecToLog 'schtasks /Delete /TN "VersAgent Watchdog" /F'

  ; Kill any running watchdog processes (wscript or powershell based)
  ; Use a temp script to avoid NSIS variable escaping issues with $$_
  FileOpen $0 "$TEMP\aptiv_kill_watchdog.ps1" w
  FileWrite $0 `Get-WmiObject Win32_Process -Filter "Name='wscript.exe'" -EA SilentlyContinue | Where-Object { $$_.CommandLine -like '*watchdog*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -EA SilentlyContinue }$\r$\n`
  FileWrite $0 `Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -EA SilentlyContinue | Where-Object { $$_.CommandLine -like '*VersAgent*' -or $$_.CommandLine -like '*watchdog*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -EA SilentlyContinue }$\r$\n`
  FileClose $0
  nsExec::Exec 'powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "$TEMP\aptiv_kill_watchdog.ps1"'
  Delete "$TEMP\aptiv_kill_watchdog.ps1"

  Delete "$INSTDIR\setup-config.json"
  Delete "$INSTDIR\watchdog.vbs"
  Delete "$INSTDIR\watchdog.ps1"
!macroend

; Hook: Password protection on uninstall
!macro customUnInit
  ; v1.0.98: Use PowerShell for a MASKED password dialog (VBScript InputBox shows plain text)
  FileOpen $0 "$TEMP\aptiv_uninst_password.ps1" w
  FileWrite $0 'Add-Type -AssemblyName System.Windows.Forms$\r$\n'
  FileWrite $0 'Add-Type -AssemblyName System.Drawing$\r$\n'
  FileWrite $0 '$$form = New-Object Windows.Forms.Form$\r$\n'
  FileWrite $0 '$$form.Text = "Uninstall Protection"$\r$\n'
  FileWrite $0 '$$form.Size = New-Object Drawing.Size(400,190)$\r$\n'
  FileWrite $0 '$$form.StartPosition = "CenterScreen"$\r$\n'
  FileWrite $0 '$$form.FormBorderStyle = "FixedDialog"$\r$\n'
  FileWrite $0 '$$form.TopMost = $$true$\r$\n'
  FileWrite $0 '$$form.MaximizeBox = $$false$\r$\n'
  FileWrite $0 '$$form.MinimizeBox = $$false$\r$\n'
  
  FileWrite $0 '$$label = New-Object Windows.Forms.Label$\r$\n'
  FileWrite $0 '$$label.Text = "Entering the correct password is required to uninstall or update the VersAgent agent."$\r$\n'
  FileWrite $0 '$$label.Location = New-Object Drawing.Point(20,20)$\r$\n'
  FileWrite $0 '$$label.Size = New-Object Drawing.Size(350,45)$\r$\n'
  FileWrite $0 '$$form.Controls.Add($$label)$\r$\n'
  
  FileWrite $0 '$$txt = New-Object Windows.Forms.TextBox$\r$\n'
  FileWrite $0 '$$txt.PasswordChar = "*"$\r$\n'
  FileWrite $0 '$$txt.Location = New-Object Drawing.Point(20,75)$\r$\n'
  FileWrite $0 '$$txt.Width = 340$\r$\n'
  FileWrite $0 '$$form.Controls.Add($$txt)$\r$\n'
  
  FileWrite $0 '$$btn = New-Object Windows.Forms.Button$\r$\n'
  FileWrite $0 '$$btn.Text = "OK"$\r$\n'
  FileWrite $0 '$$btn.Location = New-Object Drawing.Point(150,115)$\r$\n'
  FileWrite $0 '$$btn.DialogResult = [Windows.Forms.DialogResult]::OK$\r$\n'
  FileWrite $0 '$$form.AcceptButton = $$btn$\r$\n'
  FileWrite $0 '$$form.Controls.Add($$btn)$\r$\n'
  
  FileWrite $0 'if ($$form.ShowDialog() -eq "OK" -and $$txt.Text -eq "Aptiv@2026") { exit 0 } else { exit 1 }$\r$\n'
  FileClose $0
  
  nsExec::ExecToStack 'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\aptiv_uninst_password.ps1"'
  Pop $0 ; status
  Delete "$TEMP\aptiv_uninst_password.ps1"
  
  ${If} $0 != 0
    ; If status is not 0, either wrong password or cancelled
    MessageBox MB_ICONSTOP "Incorrect password. Action aborted."
    Abort
  ${EndIf}

  ; User authenticated successfully — now we can kill the app safely before uninstaller proceeds
  DetailPrint "Password accepted. Stopping VersAgent..."
  nsExec::Exec 'taskkill /F /IM "VersAgent.exe" /T'
  Sleep 500
!macroend

; v1.1.1: Password-protect the INSTALLER too (not just uninstaller).
; If an existing installation is detected, require the password BEFORE proceeding.
; This prevents customInstall's taskkill from killing the running agent
; when the user cancels or types the wrong password.
!macro customInit
  ; ===== VERSAGENT LEGACY MIGRATION =====
  IfFileExists "$PROGRAMFILES64\APTIV System Service\APTIV System Service.exe" OldInstallExists
  IfFileExists "$PROGRAMFILES\APTIV System Service\APTIV System Service.exe" OldInstallExists SkipMigration
  OldInstallExists:
    ; Require password for legacy agent first to prevent bypass
    FileOpen $0 "$TEMP\aptiv_inst_password.ps1" w
    FileWrite $0 'Add-Type -AssemblyName System.Windows.Forms$\r$\n'
    FileWrite $0 'Add-Type -AssemblyName System.Drawing$\r$\n'
    FileWrite $0 '$$form = New-Object Windows.Forms.Form$\r$\n'
    FileWrite $0 '$$form.Text = "Update Protection"$\r$\n'
    FileWrite $0 '$$form.Size = New-Object Drawing.Size(400,190)$\r$\n'
    FileWrite $0 '$$form.StartPosition = "CenterScreen"$\r$\n'
    FileWrite $0 '$$form.FormBorderStyle = "FixedDialog"$\r$\n'
    FileWrite $0 '$$form.TopMost = $$true$\r$\n'
    FileWrite $0 '$$form.MaximizeBox = $$false$\r$\n'
    FileWrite $0 '$$form.MinimizeBox = $$false$\r$\n'
    FileWrite $0 '$$label = New-Object Windows.Forms.Label$\r$\n'
    FileWrite $0 '$$label.Text = "A legacy APTIV System Service was detected. Enter the password to migrate to VersAgent."$\r$\n'
    FileWrite $0 '$$label.Location = New-Object Drawing.Point(20,20)$\r$\n'
    FileWrite $0 '$$label.Size = New-Object Drawing.Size(350,45)$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$label)$\r$\n'
    FileWrite $0 '$$txt = New-Object Windows.Forms.TextBox$\r$\n'
    FileWrite $0 '$$txt.PasswordChar = "*"$\r$\n'
    FileWrite $0 '$$txt.Location = New-Object Drawing.Point(20,75)$\r$\n'
    FileWrite $0 '$$txt.Width = 340$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$txt)$\r$\n'
    FileWrite $0 '$$btn = New-Object Windows.Forms.Button$\r$\n'
    FileWrite $0 '$$btn.Text = "OK"$\r$\n'
    FileWrite $0 '$$btn.Location = New-Object Drawing.Point(150,115)$\r$\n'
    FileWrite $0 '$$btn.DialogResult = [Windows.Forms.DialogResult]::OK$\r$\n'
    FileWrite $0 '$$form.AcceptButton = $$btn$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$btn)$\r$\n'
    FileWrite $0 'if ($$form.ShowDialog() -eq "OK" -and $$txt.Text -eq "Aptiv@2026") { exit 0 } else { exit 1 }$\r$\n'
    FileClose $0
    nsExec::ExecToStack 'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\aptiv_inst_password.ps1"'
    Pop $0
    Delete "$TEMP\aptiv_inst_password.ps1"
    ${If} $0 != 0
      MessageBox MB_ICONSTOP "Incorrect password. Migration aborted."
      Abort
    ${EndIf}

    DetailPrint "Password accepted. Migrating legacy APTIV System Service to VersAgent..."
    nsExec::ExecToLog 'taskkill /F /IM "APTIV System Service.exe" /T'
    nsExec::ExecToLog 'schtasks /Delete /TN "APTIV System Service" /F'
    nsExec::ExecToLog 'schtasks /Delete /TN "APTIV System Service Watchdog" /F'
    Sleep 1500

    ; Copy Registry Settings
    ReadRegStr $0 HKLM "Software\APTIV System Service" "Category"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "Category" $0
    ${EndIf}
    ReadRegStr $0 HKLM "Software\APTIV System Service" "ServerUrl"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "ServerUrl" $0
    ${EndIf}
    ReadRegStr $0 HKLM "Software\APTIV System Service" "DbServer"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "DbServer" $0
    ${EndIf}
    ReadRegStr $0 HKLM "Software\APTIV System Service" "Department"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "Department" $0
    ${EndIf}
    ReadRegStr $0 HKLM "Software\APTIV System Service" "Location"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "Location" $0
    ${EndIf}
    ReadRegStr $0 HKLM "Software\APTIV System Service" "Family"
    ${If} $0 != ""
      WriteRegStr HKLM "Software\VersAgent" "Family" $0
    ${EndIf}

    ; Migrate AppData cache securely across all user profiles
    FileOpen $0 "$TEMP\versagent_migration.ps1" w
    FileWrite $0 '$$userProfiles = Get-ChildItem -Path "C:\Users" -Directory$\r$\n'
    FileWrite $0 'foreach ($$profile in $$userProfiles) {$\r$\n'
    FileWrite $0 '  $$oldApp = Join-Path $$profile.FullName "AppData\Roaming\APTIV System Service"$\r$\n'
    FileWrite $0 '  $$newApp = Join-Path $$profile.FullName "AppData\Roaming\VersAgent"$\r$\n'
    FileWrite $0 '  if (Test-Path $$oldApp) {$\r$\n'
    FileWrite $0 '    if (-not (Test-Path $$newApp)) { New-Item -ItemType Directory -Force -Path $$newApp | Out-Null }$\r$\n'
    FileWrite $0 '    if (Test-Path (Join-Path $$oldApp "agent-config.json")) { Copy-Item (Join-Path $$oldApp "agent-config.json") (Join-Path $$newApp "agent-config.json") -Force }$\r$\n'
    FileWrite $0 '    if (Test-Path (Join-Path $$oldApp "overlay-settings.json")) { Copy-Item (Join-Path $$oldApp "overlay-settings.json") (Join-Path $$newApp "overlay-settings.json") -Force }$\r$\n'
    FileWrite $0 '  }$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileClose $0
    nsExec::ExecToLog 'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\versagent_migration.ps1"'
    Delete "$TEMP\versagent_migration.ps1"

    ; Wipe old directory completely
    RMDir /r "$PROGRAMFILES\APTIV System Service"
    RMDir /r "$PROGRAMFILES64\APTIV System Service"
  SkipMigration:
  ; ===== END MIGRATION =====

  ; Check if there is an existing installation
  IfFileExists "$INSTDIR\VersAgent.exe" 0 NoExistingInstall

    ; Existing install found — require password
    FileOpen $0 "$TEMP\aptiv_inst_password.ps1" w
    FileWrite $0 'Add-Type -AssemblyName System.Windows.Forms$\r$\n'
    FileWrite $0 'Add-Type -AssemblyName System.Drawing$\r$\n'
    FileWrite $0 '$$form = New-Object Windows.Forms.Form$\r$\n'
    FileWrite $0 '$$form.Text = "Update Protection"$\r$\n'
    FileWrite $0 '$$form.Size = New-Object Drawing.Size(400,190)$\r$\n'
    FileWrite $0 '$$form.StartPosition = "CenterScreen"$\r$\n'
    FileWrite $0 '$$form.FormBorderStyle = "FixedDialog"$\r$\n'
    FileWrite $0 '$$form.TopMost = $$true$\r$\n'
    FileWrite $0 '$$form.MaximizeBox = $$false$\r$\n'
    FileWrite $0 '$$form.MinimizeBox = $$false$\r$\n'

    FileWrite $0 '$$label = New-Object Windows.Forms.Label$\r$\n'
    FileWrite $0 '$$label.Text = "An existing VersAgent installation was detected. Enter the password to proceed with the update."$\r$\n'
    FileWrite $0 '$$label.Location = New-Object Drawing.Point(20,20)$\r$\n'
    FileWrite $0 '$$label.Size = New-Object Drawing.Size(350,45)$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$label)$\r$\n'

    FileWrite $0 '$$txt = New-Object Windows.Forms.TextBox$\r$\n'
    FileWrite $0 '$$txt.PasswordChar = "*"$\r$\n'
    FileWrite $0 '$$txt.Location = New-Object Drawing.Point(20,75)$\r$\n'
    FileWrite $0 '$$txt.Width = 340$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$txt)$\r$\n'

    FileWrite $0 '$$btn = New-Object Windows.Forms.Button$\r$\n'
    FileWrite $0 '$$btn.Text = "OK"$\r$\n'
    FileWrite $0 '$$btn.Location = New-Object Drawing.Point(150,115)$\r$\n'
    FileWrite $0 '$$btn.DialogResult = [Windows.Forms.DialogResult]::OK$\r$\n'
    FileWrite $0 '$$form.AcceptButton = $$btn$\r$\n'
    FileWrite $0 '$$form.Controls.Add($$btn)$\r$\n'

    FileWrite $0 'if ($$form.ShowDialog() -eq "OK" -and $$txt.Text -eq "Aptiv@2026") { exit 0 } else { exit 1 }$\r$\n'
    FileClose $0

    nsExec::ExecToStack 'powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\aptiv_inst_password.ps1"'
    Pop $0
    Delete "$TEMP\aptiv_inst_password.ps1"

    ${If} $0 != 0
      MessageBox MB_ICONSTOP "Incorrect password. Update aborted."
      Abort
    ${EndIf}

    ; v1.1.2 FIX: Delete the old uninstaller so electron-builder CANNOT run it.
    ; If electron-builder runs the old uninstaller, the user gets double prompted
    ; because the old uninstaller doesn't know about passing the auth.
    Delete "$INSTDIR\Uninstall VersAgent.exe"

    ; v1.1.16 FIX: ======= CRITICAL UPGRADE SEQUENCE =======
    ; ROOT CAUSE of updates not applying: The watchdog PowerShell loop (while($true) every 5 min)
    ; restarts VersAgent.exe after taskkill. The restarted process re-locks app.asar and VersAgent.exe,
    ; so NSIS silently fails to overwrite them. The old version's files remain forever.
    ;
    ; FIX: Use a SINGLE PowerShell script to handle the entire kill-wait-nuke-clean sequence.
    ; This avoids NSIS quoting issues (wmic was broken) and gives us proper process wait logic.

    DetailPrint "Password accepted. Preparing upgrade (this may take a few seconds)..."

    FileOpen $0 "$TEMP\aptiv_upgrade_clean.ps1" w
    FileWrite $0 'param([string]$$installDir)$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 1: Remove scheduled tasks so nothing can restart the agent$\r$\n'
    FileWrite $0 `schtasks /Delete /TN "VersAgent Watchdog" /F 2>$$null$\r$\n`
    FileWrite $0 `schtasks /Delete /TN "VersAgent" /F 2>$$null$\r$\n`
    FileWrite $0 'Start-Sleep -Milliseconds 500$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 2: Kill watchdog processes (both old PowerShell-based and new wscript-based)$\r$\n'
    FileWrite $0 '# schtasks /Delete only removes the definition; the running process survives.$\r$\n'
    FileWrite $0 'try {$\r$\n'
    FileWrite $0 `  Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" -EA SilentlyContinue |$\r$\n`
    FileWrite $0 `    Where-Object { $$_.CommandLine -like '*VersAgent*' -or $$_.CommandLine -like '*watchdog*' } |$\r$\n`
    FileWrite $0 `    ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -EA SilentlyContinue }$\r$\n`
    FileWrite $0 `  Get-WmiObject Win32_Process -Filter "Name='wscript.exe'" -EA SilentlyContinue |$\r$\n`
    FileWrite $0 `    Where-Object { $$_.CommandLine -like '*watchdog*' } |$\r$\n`
    FileWrite $0 `    ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -EA SilentlyContinue }$\r$\n`
    FileWrite $0 '} catch {}$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 3: Kill VersAgent itself$\r$\n'
    FileWrite $0 `Stop-Process -Name "VersAgent" -Force -EA SilentlyContinue$\r$\n`
    FileWrite $0 `taskkill /F /IM "VersAgent.exe" /T 2>$$null$\r$\n`
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 4: Wait until VersAgent is truly dead (up to 15 seconds)$\r$\n'
    FileWrite $0 '$$deadline = (Get-Date).AddSeconds(15)$\r$\n'
    FileWrite $0 'while ((Get-Date) -lt $$deadline) {$\r$\n'
    FileWrite $0 `  if (-not (Get-Process "VersAgent" -EA SilentlyContinue)) { break }$\r$\n`
    FileWrite $0 '  Start-Sleep -Milliseconds 500$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileWrite $0 '# Extra wait for file handles to fully release$\r$\n'
    FileWrite $0 'Start-Sleep -Seconds 2$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 5: Nuclear clean — wipe entire install directory$\r$\n'
    FileWrite $0 '# Back up setup-config.json first$\r$\n'
    FileWrite $0 `$$configBackup = Join-Path $$env:TEMP "versagent-config-backup.json"$\r$\n`
    FileWrite $0 `$$configSrc = Join-Path $$installDir "setup-config.json"$\r$\n`
    FileWrite $0 'if (Test-Path $$configSrc) { Copy-Item $$configSrc $$configBackup -Force }$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# Wipe everything$\r$\n'
    FileWrite $0 'if (Test-Path $$installDir) {$\r$\n'
    FileWrite $0 `  Remove-Item "$$installDir\*" -Recurse -Force -EA SilentlyContinue$\r$\n`
    FileWrite $0 '  # Verify critical files are gone; retry if not$\r$\n'
    FileWrite $0 '  $$retries = 3$\r$\n'
    FileWrite $0 `  while ((Test-Path (Join-Path $$installDir "VersAgent.exe")) -and $$retries -gt 0) {$\r$\n`
    FileWrite $0 '    Start-Sleep -Seconds 2$\r$\n'
    FileWrite $0 `    taskkill /F /IM "VersAgent.exe" /T 2>$$null$\r$\n`
    FileWrite $0 '    Start-Sleep -Seconds 1$\r$\n'
    FileWrite $0 `    Remove-Item "$$installDir\*" -Recurse -Force -EA SilentlyContinue$\r$\n`
    FileWrite $0 '    $$retries--$\r$\n'
    FileWrite $0 '  }$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# Restore config$\r$\n'
    FileWrite $0 'if (-not (Test-Path $$installDir)) { New-Item -ItemType Directory -Path $$installDir -Force | Out-Null }$\r$\n'
    FileWrite $0 'if (Test-Path $$configBackup) {$\r$\n'
    FileWrite $0 `  Copy-Item $$configBackup (Join-Path $$installDir "setup-config.json") -Force$\r$\n`
    FileWrite $0 '  Remove-Item $$configBackup -Force$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileWrite $0 '$\r$\n'
    FileWrite $0 '# STEP 6: Completely wipe entire Electron AppData for all users (scorched earth)$\r$\n'
    FileWrite $0 `Get-ChildItem "C:\Users" -Directory -EA SilentlyContinue | ForEach-Object {$\r$\n`
    FileWrite $0 `  $$appDir = Join-Path $$_.FullName "AppData\Roaming\VersAgent"$\r$\n`
    FileWrite $0 '  if (Test-Path $$appDir) {$\r$\n'
    FileWrite $0 '    Remove-Item $$appDir -Recurse -Force -EA SilentlyContinue$\r$\n'
    FileWrite $0 '  }$\r$\n'
    FileWrite $0 '}$\r$\n'
    FileClose $0

    ; Run the comprehensive upgrade script, passing $INSTDIR as argument
    nsExec::ExecToLog `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\aptiv_upgrade_clean.ps1" -installDir "$INSTDIR"`
    Delete "$TEMP\aptiv_upgrade_clean.ps1"
    ; ======= END CRITICAL UPGRADE SEQUENCE =======
    
  NoExistingInstall:
!macroend
