; Mura GIS орнатқышы (NSIS, electron-builder → nsis.include).
; Орнатқыш басында тіл таңдалады (Қазақша / Русский — package.json: nsis.installerLanguages, displayLanguageSelector).
; Таңдалған тіл бағдарламаның алғашқы интерфейс тілі болады: resources\install-lang.txt файлына жазылады,
; бағдарлама оны алғаш іске қосылғанда оқып, баптауларына (settings.json) сақтайды (main/lang.js).
; Кейін тіл «Баптаулар → Тіл / Язык» арқылы өзгертіледі.
; Үнсіз орнату (автоматты жаңарту) кезінде файл жазылмайды — пайдаланушы таңдаған тіл сақталады.

!macro customInstall
  ${IfNot} ${Silent}
    FileOpen $0 "$INSTDIR\resources\install-lang.txt" w
    ${If} $LANGUAGE == 1049
      FileWrite $0 "ru"
    ${Else}
      FileWrite $0 "kk"
    ${EndIf}
    FileClose $0
  ${EndIf}
!macroend
