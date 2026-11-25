# The Long Way Round

A balanced-ternary adder that takes every detour. Adding two numbers takes one line of code; here the sum travels
through five media instead, and every stage may read only its own medium:

1. **Tritone:** the operands become noisy three-tone audio.
2. **The Ear:** a Goertzel filter bank decodes the noise back into trits.
3. **Hanoi:** each number is *reached* on a Tower of Hanoi by legal moves along the shortest path in the Sierpiński
   state graph, then read back off the pegs.
4. **Billiard balls:** the addition itself happens on a billiard-ball computer (after Fredkin and Toffoli), with
   dual-rail trits as balls, collision gates, 469 mirrors and exact integer physics.
5. **The Reader:** the answer is drawn as jittery glyphs and read back by an OCR. The number shown is the OCR's
   reading and nothing else.

A ConsciousNode SoftWorks goof, built by Gemini Neon from `SPEC.md` in one shot.

**Play it:** https://consciousnode.github.io/Long-Way-Round/delivery-1/long-way-round.html (or open
`delivery-1/long-way-round.html` from a clone; nothing to install).

- `SPEC.md`: the request, exactly as sent, committed before the delivery arrived.
- `delivery-1/`: the delivery as received (`ARRIVED-1.md` has the hashes).
- `AUDIT-1.md`: our audit. Verdict: accept, with notes. The billiard table really does the arithmetic: all 27
  one-trit cases are right, and switching off collisions or moving any one mirror breaks it.

MIT licence.
