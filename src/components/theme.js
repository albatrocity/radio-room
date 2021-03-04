const theme = {
  name: "koney",
  spacing: 8,
  global: {
    font: {
      family: "'Nunito', sans-serif",
    },
    colors: {
      brand: "#f14561",
      "accent-1": "#6fab53",
      "accent-2": "#e55215",
      "accent-3": "#39e7ef",
      "accent-4": "#dbe4a9",
    },
    focus: {
      outline: {
        color: "accent-3",
      },
    },
    breakpoints: {
      small: {
        value: 414,
        borderSize: {
          xsmall: "1px",
          small: "2px",
          medium: "2px",
          large: "3px",
          xlarge: "6px",
        },
        edgeSize: {
          none: "0px",
          hair: "1px",
          xxsmall: "2px",
          xsmall: "2px",
          small: "3px",
          medium: "6px",
          large: "12px",
          xlarge: "24px",
        },
        size: {
          xxsmall: "12px",
          xsmall: "24px",
          small: "48px",
          medium: "96px",
          large: "192px",
          xlarge: "384px",
          full: "100%",
        },
      },
      medium: {
        value: 768,
      },
      large: {},
    },
    edgeSize: {
      none: "0px",
      hair: "1px",
      xxsmall: "2px",
      xsmall: "3px",
      small: "6px",
      medium: "12px",
      large: "24px",
      xlarge: "48px",
      responsiveBreakpoint: "small",
    },
  },
  button: {
    border: {
      radius: "0.3rem",
    },
  },
  formField: {
    info: {
      margin: "xlarge",
      fontSize: "small",
      color: "brand",
    },
    info: {
      size: "small",
    },
  },
  heading: {
    level: {
      "1": {
        small: {
          size: "23px",
          height: "27px",
          maxWidth: "363px",
        },
        medium: {
          size: "33px",
          height: "37px",
          maxWidth: "533px",
        },
        large: {
          size: "55px",
          height: "59px",
          maxWidth: "875px",
        },
        xlarge: {
          size: "76px",
          height: "80px",
          maxWidth: "1216px",
        },
      },
      "2": {
        small: {
          size: "20px",
          height: "24px",
          maxWidth: "320px",
        },
        medium: {
          size: "28px",
          height: "32px",
          maxWidth: "448px",
        },
        large: {
          size: "36px",
          height: "40px",
          maxWidth: "576px",
        },
        xlarge: {
          size: "44px",
          height: "48px",
          maxWidth: "704px",
        },
      },
      "3": {
        small: {
          size: "17px",
          height: "21px",
          maxWidth: "277px",
        },
        medium: {
          size: "23px",
          height: "27px",
          maxWidth: "363px",
        },
        large: {
          size: "28px",
          height: "32px",
          maxWidth: "448px",
        },
        xlarge: {
          size: "33px",
          height: "37px",
          maxWidth: "533px",
        },
      },
      "4": {
        small: {
          size: "15px",
          height: "19px",
          maxWidth: "235px",
        },
        medium: {
          size: "17px",
          height: "21px",
          maxWidth: "277px",
        },
        large: {
          size: "20px",
          height: "24px",
          maxWidth: "320px",
        },
        xlarge: {
          size: "23px",
          height: "27px",
          maxWidth: "363px",
        },
      },
      "5": {
        small: {
          size: "11px",
          height: "15px",
          maxWidth: "171px",
        },
        medium: {
          size: "11px",
          height: "15px",
          maxWidth: "171px",
        },
        large: {
          size: "11px",
          height: "15px",
          maxWidth: "171px",
        },
        xlarge: {
          size: "11px",
          height: "15px",
          maxWidth: "171px",
        },
      },
      "6": {
        small: {
          size: "9px",
          height: "13px",
          maxWidth: "149px",
        },
        medium: {
          size: "9px",
          height: "13px",
          maxWidth: "149px",
        },
        large: {
          size: "9px",
          height: "13px",
          maxWidth: "149px",
        },
        xlarge: {
          size: "9px",
          height: "13px",
          maxWidth: "149px",
        },
      },
    },
  },
  paragraph: {
    small: {
      size: "11px",
      height: "15px",
    },
    medium: {
      size: "12px",
      height: "16px",
    },
    large: {
      size: "15px",
      height: "19px",
    },
    xlarge: {
      size: "17px",
      height: "21px",
    },
    xxlarge: {
      size: "23px",
      height: "27px",
    },
  },
  text: {
    xsmall: {
      size: "9px",
      height: "13px",
      maxWidth: "149px",
    },
    small: {
      size: "11px",
      height: "15px",
      maxWidth: "171px",
    },
    medium: {
      size: "12px",
      height: "16px",
      maxWidth: "192px",
    },
    large: {
      size: "15px",
      height: "19px",
      maxWidth: "235px",
    },
    xlarge: {
      size: "17px",
      height: "21px",
      maxWidth: "277px",
    },
    xxlarge: {
      size: "23px",
      height: "27px",
      maxWidth: "363px",
    },
  },
  scale: 1,
}

export default theme
