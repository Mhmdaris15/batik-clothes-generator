#!/usr/bin/env python3
"""Remove background from image using rembg (u2net model).

Reads raw base64 image from stdin, writes base64 RGBA PNG to stdout.
"""
import sys
import base64
from rembg import remove


def main():
    input_b64 = sys.stdin.buffer.read().decode("ascii")
    input_bytes = base64.b64decode(input_b64)
    output_bytes = remove(input_bytes)
    output_b64 = base64.b64encode(output_bytes).decode("ascii")
    sys.stdout.write(output_b64)


if __name__ == "__main__":
    main()
