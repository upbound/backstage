import React from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  svg: {
    width: 'auto',
    height: 28,
  },
  path: {
    fill: '#7df3e1',
  },
});

const LogoIcon = () => {
  const classes = useStyles();

  return (
    <svg width="32px" height="32px" viewBox="0 0 56 56" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <title>Group 6</title>
    <defs>
        <polygon id="path-1" points="0.2472 0.6443 14.905 0.6443 14.905 20 0.2472 20"></polygon>
        <polygon id="path-3" points="0 0 5.8728 0 5.8728 5.8737 0 5.8737"></polygon>
    </defs>
    <g id="Symbols" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
        <g id="Navigation/Desktop/Side/Minimized-with-Labels" transform="translate(-29.000000, -30.000000)">
            <g id="Group-6" transform="translate(29.000000, 30.000000)">
                <rect id="Rectangle" fill="#9b5efc" x="0" y="0" width="56" height="56" rx="10"></rect>
                <g id="Group-4" transform="translate(13.000000, 14.000000)">
                    <path d="M14.5857,11.1606 L14.5307,16.6086 C14.5307,21.8446 9.4887,22.9066 7.7347,22.9066 C4.0847,22.9066 1.0027,20.6836 1.0027,16.6086 L1.0027,10.8516 C1.0027,9.5776 1.7377,8.8136 2.9277,8.8136 C4.1447,8.8136 4.8797,9.5776 4.8797,10.8516 L4.8797,16.1716 C4.8797,18.2376 5.9237,19.3686 7.7347,19.3686 C9.6587,19.3686 10.7087,18.4066 10.7087,16.1716 L10.7087,11.1606 C10.7087,9.8876 11.4447,9.1236 12.6617,9.1236 C13.8507,9.1236 14.5857,9.8876 14.5857,11.1606" id="Fill-1" fill="#FFFFFF"></path>
                    <g id="Group-5" transform="translate(17.000000, 8.000000)">
                        <mask id="mask-2" fill="white">
                          <polygon id="path-1" points="0.2472 0.6443 14.905 0.6443 14.905 20 0.2472 20"></polygon>
                        </mask>
                        <g id="Clip-4"></g>
                        <path d="M10.9432,7.7753 C10.9432,5.6243 9.5562,4.1813 7.5762,4.1813 C5.5672,4.1813 4.1232,5.6813 4.1232,7.7753 C4.1232,9.8693 5.5672,11.3693 7.5762,11.3693 C9.5562,11.3693 10.9432,9.8973 10.9432,7.7753 M14.9052,7.7753 C14.9052,12.1053 12.3012,14.9063 8.3682,14.9063 C6.5862,14.9063 5.1422,14.2843 4.1802,13.2083 L4.1232,13.2083 L4.1232,17.9343 C4.1232,19.2073 3.3872,20.0003 2.1712,20.0003 C0.9822,20.0003 0.2472,19.2073 0.2472,17.9343 L0.2472,2.8513 C0.2472,1.5773 0.9822,0.8143 2.1712,0.8143 C3.2172,0.8143 3.9252,1.3803 4.0952,2.3703 L4.1512,2.3703 C5.1142,1.2663 6.5572,0.6443 8.3682,0.6443 C12.3012,0.6443 14.9052,3.4453 14.9052,7.7753" id="Fill-3" fill="#FFFFFF" mask="url(#mask-2)"></path>
                    </g>
                    <g id="Group-8">
                        <mask id="mask-4" fill="white">
                          <polygon id="path-3" points="0 0 5.8728 0 5.8728 5.8737 0 5.8737"></polygon>
                        </mask>
                        <g id="Clip-7"></g>
                        <path d="M5.8728,2.9367 C5.8728,4.5587 4.5588,5.8737 2.9358,5.8737 C1.3148,5.8737 -0.0002,4.5587 -0.0002,2.9367 C-0.0002,1.3147 1.3148,-0.0003 2.9358,-0.0003 C4.5588,-0.0003 5.8728,1.3147 5.8728,2.9367" id="Fill-6" fill="#FFFFFF" mask="url(#mask-4)"></path>
                    </g>
                </g>
            </g>
        </g>
    </g>
</svg>
  );
};

export default LogoIcon;
