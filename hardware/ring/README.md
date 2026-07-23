# Ring firmware

Place the ring's firmware project here. The first integration target is a
double-tap gesture that sends the `double_tap` event described in the shared
hardware event contract.

Suggested layout when firmware arrives:

```text
ring/
├── firmware/
├── tests/
├── platformio.ini or CMakeLists.txt
└── README.md
```

Keep board-specific setup and flashing instructions in this directory.
