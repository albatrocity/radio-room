const theme = {
  name: "ross",
  rounding: 2,
  spacing: 20,
  defaultMode: "light",
  global: {
    colors: {
      brand: {
        dark: "#00AAEA",
        light: "#00AAEA",
      },
      "accent-1": "#EE492A",
      "accent-2": "#F9D000",
      "accent-3": "#F9D000",
      "accent-4": "#fefcef",
      background: {
        dark: "#383D45",
        light: "#FFFFFF",
      },
      "background-back": {
        dark: "#111111",
        light: "#fefcef",
      },
      "background-front": {
        dark: "#73767C",
        light: "#B8E9FA",
      },
      "background-contrast": {
        dark: "#FFFFFF11",
        light: "#11111111",
      },
      text: {
        dark: "#EEEEEE",
        light: "#333333",
      },
      "text-strong": {
        dark: "#FFFFFF",
        light: "#000000",
      },
      "text-weak": {
        dark: "#CCCCCC",
        light: "#444444",
      },
      "text-xweak": {
        dark: "#999999",
        light: "#666666",
      },
      border: {
        dark: "#444444",
        light: "#73cae8",
      },
      control: "brand",
      "active-background": "background-contrast",
      "active-text": "text-strong",
      "selected-background": "brand",
      "selected-text": "text-strong",
      "status-critical": "#FF4040",
      "status-warning": "#FFAA15",
      "status-ok": "#00C781",
      "status-unknown": "#CCCCCC",
      "status-disabled": "#CCCCCC",
      "graph-0": "brand",
      "graph-1": "status-warning",
    },
    font: {
      family: "'Cabin', sans",
      size: "15px",
      height: "20px",
      maxWidth: "300px",
      face:
        "/* vietnamese */\n@font-face {\n  font-family: 'Cabin';\n  font-style: normal;\n  font-weight: 400;\n  font-stretch: 100%;\n  src: url(https://fonts.gstatic.com/s/cabin/v17/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkV2EH7mlwUzuA_q9BtS8.woff) format('woff');\n  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9, U+20AB;\n}\n/* latin-ext */\n@font-face {\n  font-family: 'Cabin';\n  font-style: normal;\n  font-weight: 400;\n  font-stretch: 100%;\n  src: url(https://fonts.gstatic.com/s/cabin/v17/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkV2EH7ilwUzuA_q9BtS8.woff) format('woff');\n  unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF;\n}\n/* latin */\n@font-face {\n  font-family: 'Cabin';\n  font-style: normal;\n  font-weight: 400;\n  font-stretch: 100%;\n  src: url(https://fonts.gstatic.com/s/cabin/v17/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkV2EH7alwUzuA_q9Bg.woff) format('woff');\n  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;\n}\n",
    },
    active: {
      background: "active-background",
      color: "active-text",
    },
    hover: {
      background: "active-background",
      color: "active-text",
    },
    selected: {
      background: "selected-background",
      color: "selected-text",
    },
    control: {
      border: {
        radius: "2px",
      },
    },
    drop: {
      border: {
        radius: "2px",
      },
    },
    borderSize: {
      xsmall: "1px",
      small: "2px",
      medium: "3px",
      large: "10px",
      xlarge: "20px",
    },
    breakpoints: {
      small: {
        value: 640,
        borderSize: {
          xsmall: "1px",
          small: "2px",
          medium: "3px",
          large: "5px",
          xlarge: "10px",
        },
        edgeSize: {
          none: "0px",
          hair: "1px",
          xxsmall: "2px",
          xsmall: "3px",
          small: "5px",
          medium: "10px",
          large: "20px",
          xlarge: "40px",
        },
        size: {
          xxsmall: "20px",
          xsmall: "40px",
          small: "80px",
          medium: "160px",
          large: "320px",
          xlarge: "640px",
          full: "100%",
        },
      },
      medium: {
        value: 1280,
      },
      large: {},
    },
    edgeSize: {
      none: "0px",
      hair: "1px",
      xxsmall: "3px",
      xsmall: "5px",
      small: "10px",
      medium: "20px",
      large: "40px",
      xlarge: "80px",
      responsiveBreakpoint: "small",
    },
    input: {
      padding: "10px",
      weight: 600,
    },
    spacing: "20px",
    size: {
      xxsmall: "40px",
      xsmall: "80px",
      small: "160px",
      medium: "320px",
      large: "640px",
      xlarge: "960px",
      xxlarge: "1280px",
      full: "100%",
    },
  },
  chart: {},
  diagram: {
    line: {},
  },
  meter: {},
  button: {
    primary: {
      text: "yellow",
    },
    border: {
      width: "2px",
      radius: "15px",
    },
    padding: {
      vertical: "3px",
      horizontal: "18px",
    },
  },
  checkBox: {
    check: {
      radius: "2px",
    },
    toggle: {
      radius: "20px",
      size: "40px",
    },
    size: "20px",
  },
  radioButton: {
    size: "20px",
  },
  formField: {
    border: {
      color: "border",
      error: {
        color: {
          dark: "white",
          light: "status-critical",
        },
      },
      position: "inner",
      side: "bottom",
    },
    content: {
      pad: "small",
    },
    disabled: {
      background: {
        color: "status-disabled",
        opacity: "medium",
      },
    },
    error: {
      color: "status-critical",
      margin: {
        vertical: "xsmall",
        horizontal: "small",
      },
    },
    help: {
      color: "dark-3",
      margin: {
        start: "small",
      },
    },
    info: {
      color: "text-xweak",
      margin: {
        vertical: "xsmall",
        horizontal: "small",
      },
    },
    label: {
      margin: {
        vertical: "xsmall",
        horizontal: "small",
      },
    },
    margin: {
      bottom: "small",
    },
    round: "2px",
  },
  calendar: {
    small: {
      fontSize: "12.333333333333332px",
      lineHeight: 1.375,
      daySize: "22.86px",
    },
    medium: {
      fontSize: "15px",
      lineHeight: 1.45,
      daySize: "45.71px",
    },
    large: {
      fontSize: "23px",
      lineHeight: 1.11,
      daySize: "91.43px",
    },
  },
  clock: {
    analog: {
      hour: {
        width: "7px",
        size: "20px",
      },
      minute: {
        width: "3px",
        size: "10px",
      },
      second: {
        width: "3px",
        size: "8px",
      },
      size: {
        small: "60px",
        medium: "80px",
        large: "120px",
        xlarge: "180px",
        huge: "240px",
      },
    },
    digital: {
      text: {
        xsmall: {
          size: "9.666666666666666px",
          height: 1.5,
        },
        small: {
          size: "12.333333333333332px",
          height: 1.43,
        },
        medium: {
          size: "15px",
          height: 1.375,
        },
        large: {
          size: "17.666666666666668px",
          height: 1.167,
        },
        xlarge: {
          size: "20.333333333333336px",
          height: 1.1875,
        },
        xxlarge: {
          size: "25.666666666666668px",
          height: 1.125,
        },
      },
    },
  },
  heading: {
    level: {
      "1": {
        small: {
          size: "26px",
          height: "31px",
          maxWidth: "513px",
        },
        medium: {
          size: "36px",
          height: "41px",
          maxWidth: "727px",
        },
        large: {
          size: "58px",
          height: "63px",
          maxWidth: "1153px",
        },
        xlarge: {
          size: "79px",
          height: "84px",
          maxWidth: "1580px",
        },
      },
      "2": {
        small: {
          size: "23px",
          height: "28px",
          maxWidth: "460px",
        },
        medium: {
          size: "31px",
          height: "36px",
          maxWidth: "620px",
        },
        large: {
          size: "39px",
          height: "44px",
          maxWidth: "780px",
        },
        xlarge: {
          size: "47px",
          height: "52px",
          maxWidth: "940px",
        },
      },
      "3": {
        small: {
          size: "20px",
          height: "25px",
          maxWidth: "407px",
        },
        medium: {
          size: "26px",
          height: "31px",
          maxWidth: "513px",
        },
        large: {
          size: "31px",
          height: "36px",
          maxWidth: "620px",
        },
        xlarge: {
          size: "36px",
          height: "41px",
          maxWidth: "727px",
        },
      },
      "4": {
        small: {
          size: "18px",
          height: "23px",
          maxWidth: "353px",
        },
        medium: {
          size: "20px",
          height: "25px",
          maxWidth: "407px",
        },
        large: {
          size: "23px",
          height: "28px",
          maxWidth: "460px",
        },
        xlarge: {
          size: "26px",
          height: "31px",
          maxWidth: "513px",
        },
      },
      "5": {
        small: {
          size: "14px",
          height: "19px",
          maxWidth: "273px",
        },
        medium: {
          size: "14px",
          height: "19px",
          maxWidth: "273px",
        },
        large: {
          size: "14px",
          height: "19px",
          maxWidth: "273px",
        },
        xlarge: {
          size: "14px",
          height: "19px",
          maxWidth: "273px",
        },
      },
      "6": {
        small: {
          size: "12px",
          height: "17px",
          maxWidth: "247px",
        },
        medium: {
          size: "12px",
          height: "17px",
          maxWidth: "247px",
        },
        large: {
          size: "12px",
          height: "17px",
          maxWidth: "247px",
        },
        xlarge: {
          size: "12px",
          height: "17px",
          maxWidth: "247px",
        },
      },
    },
  },
  paragraph: {
    small: {
      size: "14px",
      height: "19px",
      maxWidth: "273px",
    },
    medium: {
      size: "15px",
      height: "20px",
      maxWidth: "300px",
    },
    large: {
      size: "18px",
      height: "23px",
      maxWidth: "353px",
    },
    xlarge: {
      size: "20px",
      height: "25px",
      maxWidth: "407px",
    },
    xxlarge: {
      size: "26px",
      height: "31px",
      maxWidth: "513px",
    },
  },
  text: {
    xsmall: {
      size: "12px",
      height: "17px",
      maxWidth: "247px",
    },
    small: {
      size: "14px",
      height: "19px",
      maxWidth: "273px",
    },
    medium: {
      size: "15px",
      height: "20px",
      maxWidth: "300px",
    },
    large: {
      size: "18px",
      height: "23px",
      maxWidth: "353px",
    },
    xlarge: {
      size: "20px",
      height: "25px",
      maxWidth: "407px",
    },
    xxlarge: {
      size: "26px",
      height: "31px",
      maxWidth: "513px",
    },
  },
  scale: 10.8,
}

// const theme = {
//   name: "ross",
//   spacing: 16,
//   global: {
//     font: {
//       family: "'Cabin', sans-serif",
//     },
//     colors: {
//       brand: "#f14561",
//       "accent-1": "#6fab53",
//       "accent-2": "#e55215",
//       "accent-3": "#39e7ef",
//       "accent-4": "#dbe4a9",
//     },
//     focus: {
//       outline: {
//         color: "accent-3",
//       },
//     },
//     breakpoints: {
//       small: {
//         value: 384,
//         borderSize: {
//           xsmall: "1px",
//           small: "2px",
//           medium: "2px",
//           large: "3px",
//           xlarge: "6px",
//         },
//         edgeSize: {
//           none: "0px",
//           hair: "1px",
//           xxsmall: "2px",
//           xsmall: "2px",
//           small: "3px",
//           medium: "6px",
//           large: "12px",
//           xlarge: "24px",
//         },
//         size: {
//           xxsmall: "12px",
//           xsmall: "24px",
//           small: "48px",
//           medium: "96px",
//           large: "192px",
//           xlarge: "384px",
//           full: "100%",
//         },
//       },
//       medium: {
//         value: 768,
//       },
//       large: {},
//     },
//     edgeSize: {
//       none: "0px",
//       hair: "1px",
//       xxsmall: "2px",
//       xsmall: "3px",
//       small: "6px",
//       medium: "12px",
//       large: "24px",
//       xlarge: "48px",
//       responsiveBreakpoint: "small",
//     },
//   },
//   button: {
//     border: {
//       radius: "0.3rem",
//     },
//   },
//   formField: {
//     info: {
//       margin: "xlarge",
//       fontSize: "small",
//       color: "brand",
//     },
//     info: {
//       size: "small",
//     },
//   },
//   heading: {
//     level: {
//       "1": {
//         small: {
//           size: "23px",
//           height: "27px",
//           maxWidth: "363px",
//         },
//         medium: {
//           size: "33px",
//           height: "37px",
//           maxWidth: "533px",
//         },
//         large: {
//           size: "55px",
//           height: "59px",
//           maxWidth: "875px",
//         },
//         xlarge: {
//           size: "76px",
//           height: "80px",
//           maxWidth: "1216px",
//         },
//       },
//       "2": {
//         small: {
//           size: "20px",
//           height: "24px",
//           maxWidth: "320px",
//         },
//         medium: {
//           size: "28px",
//           height: "32px",
//           maxWidth: "448px",
//         },
//         large: {
//           size: "36px",
//           height: "40px",
//           maxWidth: "576px",
//         },
//         xlarge: {
//           size: "44px",
//           height: "48px",
//           maxWidth: "704px",
//         },
//       },
//       "3": {
//         small: {
//           size: "17px",
//           height: "21px",
//           maxWidth: "277px",
//         },
//         medium: {
//           size: "23px",
//           height: "27px",
//           maxWidth: "363px",
//         },
//         large: {
//           size: "28px",
//           height: "32px",
//           maxWidth: "448px",
//         },
//         xlarge: {
//           size: "33px",
//           height: "37px",
//           maxWidth: "533px",
//         },
//       },
//       "4": {
//         small: {
//           size: "15px",
//           height: "19px",
//           maxWidth: "235px",
//         },
//         medium: {
//           size: "17px",
//           height: "21px",
//           maxWidth: "277px",
//         },
//         large: {
//           size: "20px",
//           height: "24px",
//           maxWidth: "320px",
//         },
//         xlarge: {
//           size: "23px",
//           height: "27px",
//           maxWidth: "363px",
//         },
//       },
//       "5": {
//         small: {
//           size: "11px",
//           height: "15px",
//           maxWidth: "171px",
//         },
//         medium: {
//           size: "11px",
//           height: "15px",
//           maxWidth: "171px",
//         },
//         large: {
//           size: "11px",
//           height: "15px",
//           maxWidth: "171px",
//         },
//         xlarge: {
//           size: "11px",
//           height: "15px",
//           maxWidth: "171px",
//         },
//       },
//       "6": {
//         small: {
//           size: "9px",
//           height: "13px",
//           maxWidth: "149px",
//         },
//         medium: {
//           size: "9px",
//           height: "13px",
//           maxWidth: "149px",
//         },
//         large: {
//           size: "9px",
//           height: "13px",
//           maxWidth: "149px",
//         },
//         xlarge: {
//           size: "9px",
//           height: "13px",
//           maxWidth: "149px",
//         },
//       },
//     },
//   },
//   paragraph: {
//     small: {
//       size: "11px",
//       height: "15px",
//     },
//     medium: {
//       size: "12px",
//       height: "16px",
//     },
//     large: {
//       size: "15px",
//       height: "19px",
//     },
//     xlarge: {
//       size: "17px",
//       height: "21px",
//     },
//     xxlarge: {
//       size: "23px",
//       height: "27px",
//     },
//   },
//   text: {
//     xsmall: {
//       size: "9px",
//       height: "13px",
//       maxWidth: "149px",
//     },
//     small: {
//       size: "11px",
//       height: "15px",
//       maxWidth: "171px",
//     },
//     medium: {
//       size: "12px",
//       height: "16px",
//       maxWidth: "192px",
//     },
//     large: {
//       size: "15px",
//       height: "19px",
//       maxWidth: "235px",
//     },
//     xlarge: {
//       size: "17px",
//       height: "21px",
//       maxWidth: "277px",
//     },
//     xxlarge: {
//       size: "23px",
//       height: "27px",
//       maxWidth: "363px",
//     },
//   },
//   scale: 1,
// }
//
export default theme
