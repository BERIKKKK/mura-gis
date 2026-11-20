;Language: Kazakh (1087)
;Mura GIS: қазақша аударма (NSIS-тің ресми таратылымында қазақ тілі жоқ; Russian.nsh негізінде аударылды)

!insertmacro LANGFILE "Kazakh" = "Қазақша" "Qazaqsha"

!ifdef MUI_WELCOMEPAGE
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TITLE "$(^NameDA) орнату шеберіне қош келдіңіз"
  ${LangFileString} MUI_TEXT_WELCOME_INFO_TEXT "Бұл бағдарлама $(^NameDA) компьютеріңізге орнатады.$\r$\n$\r$\nОрнатуды бастамас бұрын жұмыс істеп тұрған барлық қосымшаны жабу ұсынылады. Сонда орнатқыш жүйелік файлдарды компьютерді қайта қоспай жаңарта алады.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_UNWELCOMEPAGE
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TITLE "$(^NameDA) жою шеберіне қош келдіңіз"
  ${LangFileString} MUI_UNTEXT_WELCOME_INFO_TEXT "Бұл бағдарлама $(^NameDA) компьютеріңізден жояды.$\r$\n$\r$\nЖоюды бастамас бұрын $(^NameDA) іске қосылмағанына көз жеткізіңіз.$\r$\n$\r$\n$_CLICK"
!endif

!ifdef MUI_LICENSEPAGE
  ${LangFileString} MUI_TEXT_LICENSE_TITLE "Лицензиялық келісім"
  ${LangFileString} MUI_TEXT_LICENSE_SUBTITLE "$(^NameDA) орнатпас бұрын лицензиялық келісіммен танысыңыз."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM "Келісім шарттарын қабылдасаңыз, $\"Қабылдаймын$\" батырмасын басыңыз. Бағдарламаны орнату үшін келісімді қабылдау қажет."
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келісім шарттарын қабылдасаңыз, төмендегі құсбелгіні қойыңыз. Бағдарламаны орнату үшін келісімді қабылдау қажет. $_CLICK"
  ${LangFileString} MUI_INNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келісім шарттарын қабылдасаңыз, төмендегі бірінші нұсқаны таңдаңыз. Бағдарламаны орнату үшін келісімді қабылдау қажет. $_CLICK"
!endif

!ifdef MUI_UNLICENSEPAGE
  ${LangFileString} MUI_UNTEXT_LICENSE_TITLE "Лицензиялық келісім"
  ${LangFileString} MUI_UNTEXT_LICENSE_SUBTITLE "$(^NameDA) жоймас бұрын лицензиялық келісіммен танысыңыз."
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM "Келісім шарттарын қабылдасаңыз, $\"Қабылдаймын$\" батырмасын басыңыз. Жою үшін келісімді қабылдау қажет. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_CHECKBOX "Келісім шарттарын қабылдасаңыз, төмендегі құсбелгіні қойыңыз. Жою үшін келісімді қабылдау қажет. $_CLICK"
  ${LangFileString} MUI_UNINNERTEXT_LICENSE_BOTTOM_RADIOBUTTONS "Келісім шарттарын қабылдасаңыз, төмендегі бірінші нұсқаны таңдаңыз. Жою үшін келісімді қабылдау қажет. $_CLICK"
!endif

!ifdef MUI_LICENSEPAGE | MUI_UNLICENSEPAGE
  ${LangFileString} MUI_INNERTEXT_LICENSE_TOP "Мәтін бойынша жылжу үшін $\"PageUp$\" және $\"PageDown$\" пернелерін пайдаланыңыз."
!endif

!ifdef MUI_COMPONENTSPAGE
  ${LangFileString} MUI_TEXT_COMPONENTS_TITLE "Орнатылатын құрамдас бөліктер"
  ${LangFileString} MUI_TEXT_COMPONENTS_SUBTITLE "$(^NameDA) бағдарламасының орнатқыңыз келетін бөліктерін таңдаңыз."
!endif

!ifdef MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_UNTEXT_COMPONENTS_TITLE "Бағдарламаның құрамдас бөліктері"
  ${LangFileString} MUI_UNTEXT_COMPONENTS_SUBTITLE "$(^NameDA) бағдарламасының жойғыңыз келетін бөліктерін таңдаңыз."
!endif

!ifdef MUI_COMPONENTSPAGE | MUI_UNCOMPONENTSPAGE
  ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_TITLE "Сипаттамасы"
  !ifndef NSIS_CONFIG_COMPONENTPAGE_ALTERNATIVE
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Сипаттамасын оқу үшін тінтуірді құрамдас бөліктің атауына апарыңыз."
  !else
    ${LangFileString} MUI_INNERTEXT_COMPONENTS_DESCRIPTION_INFO "Сипаттамасын көру үшін құрамдас бөлікті таңдаңыз."
  !endif
!endif

!ifdef MUI_DIRECTORYPAGE
  ${LangFileString} MUI_TEXT_DIRECTORY_TITLE "Орнату қалтасын таңдау"
  ${LangFileString} MUI_TEXT_DIRECTORY_SUBTITLE "$(^NameDA) орнатылатын қалтаны таңдаңыз."
!endif

!ifdef MUI_UNDIRECTORYPAGE
  ${LangFileString} MUI_UNTEXT_DIRECTORY_TITLE "Жойылатын қалтаны таңдау"
  ${LangFileString} MUI_UNTEXT_DIRECTORY_SUBTITLE "$(^NameDA) жойылатын қалтаны көрсетіңіз."
!endif

!ifdef MUI_INSTFILESPAGE
  ${LangFileString} MUI_TEXT_INSTALLING_TITLE "Файлдарды көшіру"
  ${LangFileString} MUI_TEXT_INSTALLING_SUBTITLE "Күте тұрыңыз, $(^NameDA) файлдары көшірілуде..."
  ${LangFileString} MUI_TEXT_FINISH_TITLE "Орнату аяқталды"
  ${LangFileString} MUI_TEXT_FINISH_SUBTITLE "Орнату сәтті аяқталды."
  ${LangFileString} MUI_TEXT_ABORT_TITLE "Орнату тоқтатылды"
  ${LangFileString} MUI_TEXT_ABORT_SUBTITLE "Орнату аяқталмады."
!endif

!ifdef MUI_UNINSTFILESPAGE
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_TITLE "Жою"
  ${LangFileString} MUI_UNTEXT_UNINSTALLING_SUBTITLE "Күте тұрыңыз, $(^NameDA) файлдары жойылуда..."
  ${LangFileString} MUI_UNTEXT_FINISH_TITLE "Жою аяқталды"
  ${LangFileString} MUI_UNTEXT_FINISH_SUBTITLE "Бағдарлама сәтті жойылды."
  ${LangFileString} MUI_UNTEXT_ABORT_TITLE "Жою тоқтатылды"
  ${LangFileString} MUI_UNTEXT_ABORT_SUBTITLE "Жою толық орындалмады."
!endif

!ifdef MUI_FINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_INFO_TITLE "$(^NameDA) орнату шебері жұмысын аяқтады"
  ${LangFileString} MUI_TEXT_FINISH_INFO_TEXT "$(^NameDA) орнатылды.$\r$\n$\r$\nОрнатқыштан шығу үшін $\"Дайын$\" батырмасын басыңыз."
  ${LangFileString} MUI_TEXT_FINISH_INFO_REBOOT "$(^NameDA) орнатуды аяқтау үшін компьютерді қайта қосу керек. Қазір қайта қосасыз ба?"
!endif

!ifdef MUI_UNFINISHPAGE
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TITLE "$(^NameDA) жою шебері жұмысын аяқтады"
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_TEXT "$(^NameDA) компьютеріңізден жойылды.$\r$\n$\r$\nЖою бағдарламасынан шығу үшін $\"Дайын$\" батырмасын басыңыз."
  ${LangFileString} MUI_UNTEXT_FINISH_INFO_REBOOT "$(^NameDA) жоюды аяқтау үшін компьютерді қайта қосу керек. Қазір қайта қосасыз ба?"
!endif

!ifdef MUI_FINISHPAGE | MUI_UNFINISHPAGE
  ${LangFileString} MUI_TEXT_FINISH_REBOOTNOW "Иә, компьютерді қазір қайта қосу"
  ${LangFileString} MUI_TEXT_FINISH_REBOOTLATER "Жоқ, кейін өзім қайта қосамын"
  ${LangFileString} MUI_TEXT_FINISH_RUN "$(^NameDA) іске &қосу"
  ${LangFileString} MUI_TEXT_FINISH_SHOWREADME "ReadMe файлын &көрсету"
  ${LangFileString} MUI_BUTTONTEXT_FINISH "&Дайын"
!endif

!ifdef MUI_STARTMENUPAGE
  ${LangFileString} MUI_TEXT_STARTMENU_TITLE "$\"Бастау$\" мәзіріндегі қалта"
  ${LangFileString} MUI_TEXT_STARTMENU_SUBTITLE "Бағдарлама белгішелері орналасатын $\"Бастау$\" мәзіріндегі қалтаны таңдаңыз."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_TOP "Бағдарлама белгішелері орналасатын $\"Бастау$\" мәзіріндегі қалтаны таңдаңыз. Қалтаның басқа атауын да енгізуге болады."
  ${LangFileString} MUI_INNERTEXT_STARTMENU_CHECKBOX "Белгішелер құрмау"
!endif

!ifdef MUI_UNCONFIRMPAGE
  ${LangFileString} MUI_UNTEXT_CONFIRM_TITLE "$(^NameDA) жою"
  ${LangFileString} MUI_UNTEXT_CONFIRM_SUBTITLE "$(^NameDA) компьютерден жою."
!endif

!ifdef MUI_ABORTWARNING
  ${LangFileString} MUI_TEXT_ABORTWARNING "$(^Name) орнатудан шынымен бас тартасыз ба?"
!endif

!ifdef MUI_UNABORTWARNING
  ${LangFileString} MUI_UNTEXT_ABORTWARNING "$(^Name) жоюдан шынымен бас тартасыз ба?"
!endif

!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Орнату режимі"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "$(^NameDA) қай пайдаланушыларға орнатылатынын таңдаңыз."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "$(^NameDA) тек өзіңізге не осы компьютердің барлық пайдаланушысына орнатылатынын таңдаңыз. $(^ClickNext)"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Барлық пайдаланушыға орнату"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Тек ағымдағы пайдаланушыға орнату"
!endif
