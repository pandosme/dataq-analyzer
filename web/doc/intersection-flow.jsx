import { useState, useRef, useEffect } from "react";

const IMG_SRC = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAK1ArwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDw5yUtnkGM7ggz2yD/AIVT3v8A3m/Orcv/AB4P/wBdU/k1UqAHb3/vN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8350b3/vN+dNooAdvf+8350b3/vN+dNooAdvf+8350b3/ALzfnTaKAHb3/vN+dG9/7zfnTaKAHb3/ALzfnRvf+83502igB29/7zfnRvf+83502igB29/7zfnRvf8AvN+dNooAdvf+8350b3/vN+dNooAdvf8AvN+dG9/7zfnTaKAHb3/vN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83500fSpYraaY4jidj7LmgBm9/7zfnRvf+8351uaf4T1K9QyGIRRD+NyB+nWt228BwqV+0Xiv82DszgUrpAcOHf+8351JHFcS/6tJX/wB0E16ZZeFdHimZSiu6rldxJ3fT/CtOKBBPFFBaLbykYVwoXeMfln60uYDzK38O6zcrvitJWGcdf/r1cl8IavbwCW5XyQeCGbJ/Su9ijkspWkt7hvtJJHlknk+4p7zLLG888cryx8PC307+2aXMOxxX/CF3axRO83+s6YNaEngyxghj33zySMcER84PvXWJdRS6XDI9uSS5RVU9P85qK0iiMdwIY1QDDD1J9+9LmCyOaPhG1hw0izMrHB5xgDvT10LRkGTG7BuQS56dq1prhpZPLaRpWB2gYOD/AJ96uC0ijt9vlxmUclBxTuwMyDw3psm11tUXjLB2BwPWrcmi6Q1pFLFp8Q3NjlQc471PbRQphl3maXCurjAC+nP9KkvM295wxa3Ef3Yui46k/jS6jKz6Vo4jVTpiL8+d3kg5GO1V5fDOkXJZoIAEJ9NuD6Vopq0D2kcrF1254z+XAp8cjpbGSNTKkr5kzj5enrzRdjOdXwtpZnKSI6qQdrBup7Cq9x4T09UMitNsBwdpyR611V5amRZGUqjNjyyDnH4VE8Rtp4rneAhBLkng+xFUxHJS+DLbYrRX5KNjDHPB9DVK48HXEe4rc5xzgnrXXLKpkXfCVRyflAwp96bgmZo9wQA4y3OPp7VPMxHBv4c1EKWT5vYHmqUmlalFndbzcenNellQHEkm3cqgja3DYIp9wkkab1l4c5x9e35U+dgeTOk6cOHU++aj3v8A3m/OvUZtOjuoyRAjDb82cZFc1caGkgdxb7NpA2g801K4jk97/wB5vzo3v/eb862ZtEX/AJZFgScAGq8+hXsC7zHvT1Qg1QGdvf8AvN+dG9/7zfnSvFJGSHRlI9RTKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8350b3/vN+dNooAdvf+8350b3/vN+dNooAdvf+8350b3/ALzfnTaKAHb3/vN+dG9/7zfnTaKAHb3/ALzfnRvf+83502igB29/7zfnRvf+83502igB29/7zfnRvf8AvN+dNooAdvf+8350b3/vN+dNooAdvf8AvN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8351r6fZ/b7YyM20q23gdf85rGrpPD/8Ax4P/ANdT/IUAZEv/AB4Sf9dU/k1Uquy/8eD/APXVP5NVKgAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiijFABQK0bDQ77UZAsMLY67jwMV1+leAoR++1Cc7VPKrSbsFjhIraWdgsUbOx6ADNdBp3gvUbzDzL5EXq3U/hXeG2srGKO4sYE/wBGbdhhncK0vPK2xlAjdJPmTHHXnFTzDOYs/BmnWWPPR7iXAPXAFbdpaQ28UwjhjjwwXKr0+pp1xfSwxKywxyM/DBTnH1plqt3OJhI/2eI/vDtHNDYIf5fnTNYmIQQht3mM3QGq7tawSjyn3Ak4K5I+pqWZFvZFiYgqVOWz1x9KheKyfaEtvLJGCS+ADUjZMpAiQ4IkXJLo6nA9adZ3McsTv526aM7drfoRTI1jhDTQyyF1X5QWUo/14p4a1jjD3KoJ35cRHoPpQIqQyrPM63JCXKHMciHO72Pqadd3c0ELOqEzMrLJ5g4cYwDUN7DshEtv8w3hwgGcc+tS3Iaa3djIShxJuI/1Zx90/XH60gGadDJDYiVJSY88seiGrNqwmlI3oixklsHBK/5zTYpJT4W8q3UbnuDuPtgVRgCOjSGKUOTsQE8E9804gXX2IGmjTYOrZYEc+mKsTRWsseYZNp/vlielZLzCJ3BfbGrHCsvX2P0ptrt86SOMs25gEGfU9qqwGzNslkTy5S0cEfmydOc8D9SKrWq3DTmKUgNIOCO/1pdVs2gud05Kj7m2P+IL0zj6VUtrx47yG5nz82diA4CjPf8ACp8wNOWCJUKzKiOOCAuenfjrVKaQ2EQCNJKx54QhefrVqa/82J5HjXC5xs7g9CKgmunuHdZN5jMYwNuCPQ1ZQtgN0QSVnCgF1djg1ZkTzLXazCRACGyRnFVLWGK6lALSYQ5ILAnPbpVyVbjT083aswJPTv8AUUaCRmSXXlv5FzG2xzmPBHygf/rqvcTwm6QRb1YHDbuRj8KbrDrgHDcjjjms9LeY27TMJNgP3qLEt6mqtnDIpZrvbuyQuCcGoVvCYjDKWfH3SvHTvWR9rlhfIbJ/2qYDc3bkr/DydtOwrl77fKtz5kLZGeQxxSXF/wCcreXje3JJ7H0FZTxyofnDZPY08W7MC5BXH60khFpJSzEPGGz02mniGYISmVXGcbhzUAinVNyk4HovIqRZbiJc7j+IpgWG02V7I3EkMbRZ53MoasXUNOs7iUG3iMIx0zWtNeTyyAyHK7cFRWcgaWTbECx9AM0AY0+jXEShlwynpzVCSJ42IZGUj1FdmbaeVd3lnggYPam6hah44U8tXbyzuwOffNMdziuaWuhGgx3UTNBJiQdUP86yLjT57Z2V0OAeTQMq0UEYooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArpPD//AB4P/wBdT/IVzddJ4f8A+PB/+up/kKAMiX/jwf8A66p/JqpVdl/48H/66p/JqpUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAS4q/p2j3epTBII8+rHoK9B8P+C9HhjVJ7YPKx5ZmOBSugOT0Lw/Pq9wOsduPvSkcCui0HwOGKS6oSgYZVP8GuuijkspWkt7hvtJJHlknk+4p7zLLG888cryx8PC307+2aXMOxVi1e4dbdIJRFFGgihhXqx7sas2UriOR1mDMVwrEdCPrWRqIuNIvFYPGy5IIIpIb+FtSju+QWPGRzWUpWNEjQSaEq24IAkZjhj7ZqG6MX2VW88iUN0Cck/jUccUpuLyVsMjYKjdnpwDUFtM0zLHCuWOQmB1PrUtiL8YDXYVdpA5wB6Vxmq3N54i8RxaXajNspzKwPCj/wCtWp4l1aLQrBpDgzMMRr71D4E0+Sy06e+nBN1dMWZ2HQdqcSrEkvhyzjZYjK/muM4A6Cs3UNItbVQ8l4qx56qvT61p2U7w3QikCiJgfnc9BWVq1tdT3cluiPNahtxYqcIavkiJyZSitNKmBVbvLH+8MVu2mmWaWLlYAcLncxrlmsb+Jw0SFZIGw3ydR9a7a3nhuNPIinUFowNsjZOfrUToRW5UZSe5R0SKI2xkVfmzjmmeILdbu6gSUBkSP7p5HPWr2iRRW9h5UTB0XnIPem6hNBdXMfKM8ccgZSOhPTNJUILVIpzk9zKWK2t4VjihUADAGKuRRhmPQMV+5Wo1tA90YyzLLKoHGeK0ElsreVCgVSp2bW4Jxmuim7IzcmxjJG8KKSAVJDEjg0hghFwUDsYugJ5AqVnRVUumcKcn2qOQuIi0Ks5PIHYmtbjuCBVhypIJ5IpHfcBhhj0poZtvO7k00kHPpSAkhYM/Kg47k1JJuYqNwKqehNQLJzyM8dM0biSeaAJbmExMQAeeQQahB2jGQfWnoxOAKfwTkjBzQBNpkhmvUjJ4Y1taroMelIkv2lpg3QBcVz8BZZQVJUg8EVqX+pXN4yh3IV02nbUt2A5u71GW+kRiSsanOzuTUbqpDE4zmiNAlrK5BG2QJxSZOB71QhAcH5u9LgHPqKbS54p2AepCjBJJNLnJNNJGccU7BIzjP0osAtPSWVPuSOn0Y1FnBpQTnOaLAW11O9Q5W8uBj/poa0LXxXq9sFWO8JUdA4zWQpySO9SCMhM461MoJji2jfPi27kH72GGRR6g/40w+KNuP9Djz9TWMIieeaUxkDOKlQiVdl6fxFfzDC7YwfRagOr3jEkyZJ681R2lj0pwjO7mtIxijNtss/2leZ/18lOGp3oH/H1N/33VUoR2pBkHB4q7EXZa/tS+Bz9tmz/v0HVb3I/wBOnz/11NViuegowR1pWQXZaOq3p/5e5/8Avs0DVL0f8vk//fZqpjjikPFKyC7LX9qXp/5e5/8Avs0f2pen/l7n/wC+zVXNGaLILstHVL0/8vc//fZpP7UvD/y+T/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs10nh/ULptPdXu52HmE4aQnsBXH10fh//jwf/rqf5CgDIl/48JP+uqfyaqVXZf+PB/+uqfyaqVABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUYoAKBWjYaHfajIFhhbHXceBiuvwrw3cpBIX/Vm62oQhP8AnpSbsFjhIraWdgsUbOx6ADNdBp3gvUbzDzL5EXq3U/hXeG2srGKO4sYE/wBGbdhhncK0vPK2xlAjdJPmTHHXnFTzDOYs/BmnWWPPR7iXAPXAFbdpaQ28UwjhjjwwXKr0+pp1xfSwxKywxyM/DBTnH1plqt3OJhI/2eI/vDtHNDYIf5fnTNYmIQQht3mM3QGq7tawSjyn3Ak4K5I+pqWZFvZFiYgqVOWz1x9KheKyfaEtvLJGCS+ADUjZMpAiQ4IkXJLo6nA9adZ3McsTv526aM7drfoRTI1jhDTQyyF1X5QWUo/14p4a1jjD3KoJ35cRHoPpQIqQyrPM63JCXKHMciHO72Pqadd3c0ELOqEzMrLJ5g4cYwDUN7DshEtv8w3hwgGcc+tS3Iaa3djIShxJuI/1Zx90/XH60gGadDJDYiVJSY88seiGrNqwmlI3oixklsHBK/5zTYpJT4W8q3UbnuDuPtgVRgCOjSGKUOTsQE8E9804gXX2IGmjTYOrZYEc+mKsTRWsseYZNp/vlielZLzCJ3BfbGrHCsvX2P0ptrt86SOMs25gEGfU9qqwGzNslkTy5S0cEfmydOc8D9SKrWq3DTmKUgNIOCO/1pdVs2gud05Kj7m2P+IL0zj6VUtrx47yG5nz82diA4CjPf8ACp8wNOWCJUKzKiOOCAuenfjrVKaQ2EQCNJKx54QhefrVqa/82J5HjXC5xs7g9CKgmunuHdZN5jMYwNuCPQ1ZQtgN0QSVnCgF1djg1ZkTzLXazCRACGyRnFVLWGK6lALSYQ5ILAnPbpVyVbjT083aswJPTv8AUUaCRmSXXlv5FzG2xzmPBHygf/rqvcTwm6QRb1YHDbuRj8KbrDrgHDcjjjms9LeY27TMJNgP3qLEt6mqtnDIpZrvbuyQuCcGoVvCYjDKWfH3SvHTvWR9rlhfIbJ/2qYDc3bkr/DydtOwrl77fKtz5kLZGeQxxSXF/wCcreXje3JJ7H0FZTxyofnDZPY08W7MC5BXH60khFpJSzEPGGz02mniGYISmVXGcbhzUAinVNyk4HovIqRZbiJc7j+IpgWG02V7I3EkMbRZ53MoasXUNOs7iUG3iMIx0zWtNeTyyAyHK7cFRWcgaWTbECx9AM0AY0+jXEShlwynpzVCSJ42IZGUj1FdmbaeVd3lnggYPam6hah44U8tXbyzuwOffNMdziuaWuhGgx3UTNBJiQdUP86yLjT57Z2V0OAeTQMq0UEYooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArpPD//AB4P/wBdT/IVzddJ4f8A+PB/+up/kKAMiX/jwf8A66p/JqpVdl/48H/66p/JqpUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAS4q/p2j3epTBII8+rHoK9B8P+C9HhjVJ7YPKx5ZmOBSugOT0Lw/Pq9wOsduPvSkcCui0HwOGKS6oSgYZVP8GuuijkspWkt7hvtJJHlknk+4p7zLLG888cryx8PC307+2aXMOxVi1e4dbdIJRFFGgihhXqx7sas2UriOR1mDMVwrEdCPrWRqIuNIvFYPGy5IIIpIb+FtSju+QWPGRzWUpWNEjQSaEq24IAkZjhj7ZqG6MX2VW88iUN0Cck/jUccUpuLyVsMjYKjdnpwDUFtM0zLHCuWOQmB1PrUtiL8YDXYVdpA5wB6Vxmq3N54i8RxaXajNspzKwPCj/wCtWp4l1aLQrBpDgzMMRr71D4E0+Sy06e+nBN1dMWZ2HQdqcSrEkvhyzjZYjK/muM4A6Cs3UNItbVQ8l4qx56qvT61p2U7w3QikCiJgfnc9BWVq1tdT3cluiPNahtxYqcIavkiJyZSitNKmBVbvLH+8MVu2mmWaWLlYAcLncxrlmsb+Jw0SFZIGw3ydR9a7a3nhuNPIinUFowNsjZOfrUToRW5UZSe5R0SKI2xkVfmzjmmeILdbu6gSUBkSP7p5HPWr2iRRW9h5UTB0XnIPem6hNBdXMfKM8ccgZSOhPTNJUILVIpzk9zKWK2t4VjihUADAGKuRRhmPQMV+5Wo1tA90YyzLLKoHGeK0ElsreVCgVSp2bW4Jxmuim7IzcmxjJG8KKSAVJDEjg0hghFwUDsYugJ5AqVnRVUumcKcn2qOQuIi0Ks5PIHYmtbjuCBVhypIJ5IpHfcBhhj0poZtvO7k00kHPpSAkhYM/Kg47k1JJuYqNwKqehNQLJzyM8dM0biSeaAJbmExMQAeeQQahB2jGQfWnoxOAKfwTkjBzQBNpkhmvUjJ4Y1taroMelIkv2lpg3QBcVz8BZZQVJUg8EVqX+pXN4yh3IV02nbUt2A5u71GW+kRiSsanOzuTUbqpDE4zmiNAlrK5BG2QJxSZOB71QhAcH5u9LgHPqKbS54p2AepCjBJJNLnJNNJGccU7BIzjP0osAtPSWVPuSOn0Y1FnBpQTnOaLAW11O9Q5W8uBj/poa0LXxXq9sFWO8JUdA4zWQpySO9SCMhM461MoJji2jfPi27kH72GGRR6g/40w+KNuP9Djz9TWMIieeaUxkDOKlQiVdl6fxFfzDC7YwfRagOr3jEkyZJ681R2lj0pwjO7mtIxijNtss/2leZ/18lOGp3oH/H1N/33VUoR2pBkHB4q7EXZa/tS+Bz9tmz/v0HVb3I/wBOnz/11NViuegowR1pWQXZaOq3p/5e5/8Avs0DVL0f8vk//fZqpjjikPFKyC7LX9qXp/5e5/8Avs0f2pen/l7n/wC+zVXNGaLILstHVL0/8vc//fZpP7UvD/y+T/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs0f2pe/8/c//AH2arUUWQXZa/tS9/wCfuf8A77NH9qXv/P3P/wB9mq1FFkF2Wv7Uvf8An7n/AO+zR/al7/z9z/8AfZqtRRZBdlr+1L3/AJ+5/wDvs10nh/ULptPdXu52HmE4aQnsBXH10fh//jwf/rqf5CgDIl/48JP+uqfyaqVXZf8Ajwf/AK6p/JqpUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAEuKkjglnkEcKF3PRQKtaXo95q84igjJz/ABHoK9D0HwfY6TEk0yGe5bkk9BUsaRz+g+DZrpo5tQBjhPIj7mu7sLO1sUEVmhVR0AXrWgIhGoEUQjT1UdPyqrNe21oh3SAf7K81m2UkWULKcSSqqj+Fev4U0Kk0gD4JIIBP3vapraYXJJAAUdDVWe9igkeMQ+a4P3c4pDHXM8NqjlnG5V5HpUOlhpLUzMTudiST3rmfEurm0Vre3UySScKoHJNdXpETxaXGJSfNCgg+pppBcuoCH+VskDAC47UsSfvkLwh1TBJYYJqMnaRt9etWbaeS3lBkAbHCn1oKMjxKiXdlFNEG3xN8wx1zWTouh2V/plzLLFJ56Z2yBsY/CunluYJNrSruIJwMdKsRqkiKYyPm4ZhTTsBHokCC0w6FsZwT6VqttWQoG+cD5sd6rxxLFkRkLz8xqYLlgy5OBgmsZO7LJIhsYhCz8Hp6miZizLiLaQctnjb7003CIpLEAdz2rJ1PWlhBjtVaaRvuBRnP5UJNiNABGkYFdox046VHcSLDH5kzhIxyzN0FYcUN7qCrNPJHaRdQ7ckj2HaqF5Zy3rFJZdxXjCn5PxFWkI0/7RkuGYWI+VeN7dCfb2qHYeSWy3Un1qjZXMlrI8NxC8aJ8rPjIz71fExjGDkqe46UmhEsciyLuU/LULyYPP50iFN52nleRikJBHXpQAFsUjOBknnFNooAdvf8AvN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8350b3/vN+dNooAdvf+8350b3/vN+dNooAdvf+8350b3/ALzfnTaKAHb3/vN+dG9/7zfnTaKAHb3/ALzfnRvf+83502igB29/7zfnRvf+83502igB29/7zfnRvf8AvN+dNooAdvf+8350b3/vN+dNooAdvf8AvN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83500fSpYraaY4jidj7LmgBm9/7zfnRvf+8351uaf4T1K9QyGIRRD+NyB+nWt228BwqV+0Xiv82DszgUrpAcOHf+8351JHFcS/6tJX/wB0E16ZZeFdHimZSiu6rldxJ3fT/CtOKBBPFFBaLbykYVwoXeMfln60uYDzK38O6zcrvitJWGcdf/r1cl8IavbwCW5XyQeCGbJ/Su9ijkspWkt7hvtJJHlknk+4p7zLLG888cryx8PC307+2aXMOxxX/CF3axRO83+s6YNaEngyxghj33zySMcER84PvXWJdRS6XDI9uSS5RVU9P85qK0iiMdwIY1QDDD1J9+9LmCyOaPhG1hw0izMrHB5xgDvT10LRkGTG7BuQS56dq1prhpZPLaRpWB2gYOD/AJ96uC0ijt9vlxmUclBxTuwMyDw3psm11tUXjLB2BwPWrcmi6Q1pFLFp8Q3NjlQc471PbRQphl3maXCurjAC+nP9KkvM295wxa3Ef3Yui46k/jS6jKz6Vo4jVTpiL8+d3kg5GO1V5fDOkXJZoIAEJ9NuD6Vopq0D2kcrF1254z+XAp8cjpbGSNTKkr5kzj5enrzRdjOdXwtpZnKSI6qQdrBup7Cq9x4T09UMitNsBwdpyR111V5amRZGUqjNjyyDnH4VE8Rtp4rneAhBLkng+xFUxHJS+DLbYrRX5KNjDHPB9DVK48HXEe4rc5xzgnrXXLKpkXfCVRyflAwp96bgmZo9wQA4y3OPp7VPMxHBv4c1EKWT5vYHmqUmlalFndbzcenNellQHEkm3cqgja3DYIp9wkkab1l4c5x9e35U+dgeTOk6cOHU++aj3v8A3m/OvUZtOjuoyRAjDb82cZFc1caGkgdxb7NpA2g801K4jk97/wB5vzo3v/eb862ZtEX/AJZFgScAGq8+hXsC7zHvT1Qg1QGdvf8AvN+dG9/7zfnSvFJGSHRlI9RTKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8350b3/vN+dNooAdvf+8350b3/vN+dNooAdvf+8350b3/ALzfnTaKAHb3/vN+dG9/7zfnTaKAHb3/ALzfnRvf+83502igB29/7zfnRvf+83502igB29/7zfnRvf8AvN+dNooAdvf+8350b3/vN+dNooAdvf8AvN+dG9/7zfnTaKAHb3/vN+dG9/wC83502igB29/7zfnRvf+83502igB29/wC8351r6fZ/b7YyM20q23gdf85rGrpPD/8Ax4P/ANdT/IUAZEv/AB4Sf9dU/k1Uquy/8eD/APXVP5NVKgAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAK6Tw//x4P/11P8hXN10nh/8A48H/AOup/kKAMiX/AI8H/wCuqfyaqVXZf+PB/wDrqn8mqlQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFdJ4f8A+PB/+up/kK5uuk8P/wDHg//XU/yFAGRL/wAeD/8AXVP5NVKrsv8Ax4P/ANdU/k1UqACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigArpPD/wDx4P8A9dT/ACFc3XSeH/8Ajwf/AK6n+QoA/9k=";

const COUNTERS = [
  { direction: "A→B", total: 62513, Car: 57179, Human: 2257, Bus: 242, Truck: 2782, Bike: 24, Other: 29 },
  { direction: "A→C", total: 1832, Car: 442, Human: 1376, Bus: 1, Truck: 10, Bike: 2, Other: 1 },
  { direction: "A→D", total: 4084, Car: 2414, Human: 1523, Bus: 2, Truck: 142, Bike: 2, Other: 1 },
  { direction: "B→A", total: 42847, Car: 39072, Human: 1972, Bus: 88, Truck: 1699, Bike: 9, Other: 7 },
  { direction: "B→C", total: 1168, Car: 23, Human: 1142, Bus: 1, Truck: 2, Bike: 0, Other: 0 },
  { direction: "B→D", total: 4922, Car: 4587, Human: 214, Bus: 13, Truck: 106, Bike: 0, Other: 2 },
  { direction: "C→A", total: 1261, Car: 57, Human: 1188, Bus: 1, Truck: 12, Bike: 3, Other: 0 },
  { direction: "C→B", total: 1426, Car: 178, Human: 1223, Bus: 2, Truck: 21, Bike: 2, Other: 0 },
  { direction: "C→D", total: 3245, Car: 3, Human: 3236, Bus: 0, Truck: 1, Bike: 5, Other: 0 },
  { direction: "D→A", total: 4491, Car: 2797, Human: 1593, Bus: 1, Truck: 94, Bike: 0, Other: 6 },
  { direction: "D→B", total: 6664, Car: 6020, Human: 468, Bus: 7, Truck: 140, Bike: 14, Other: 15 },
  { direction: "D→C", total: 2962, Car: 12, Human: 2949, Bus: 0, Truck: 0, Bike: 1, Other: 0 },
];

const ZONE_POSITIONS = {
  A: { x: 0.15, y: 0.42 },
  B: { x: 0.82, y: 0.40 },
  C: { x: 0.44, y: 0.10 },
  D: { x: 0.48, y: 0.82 },
};

const ZONE_COLORS = {
  A: "#ef4444",
  B: "#3b82f6",
  C: "#22c55e",
  D: "#f59e0b",
};

const CLASS_COLORS = {
  Car: "#22c55e",
  Human: "#f59e0b",
  Bus: "#06b6d4",
  Truck: "#a855f7",
  Bike: "#ef4444",
  Other: "#ec4899",
};

const maxTotal = Math.max(...COUNTERS.map((c) => c.total));

function getCurvePoints(from, to, w, h, offset = 0) {
  const fx = from.x * w, fy = from.y * h;
  const tx = to.x * w, ty = to.y * h;
  const mx = (fx + tx) / 2, my = (fy + ty) / 2;
  const dx = tx - fx, dy = ty - fy;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len, ny = dx / len;
  const curveStrength = len * 0.25 + offset * 18;
  const cx = mx + nx * curveStrength;
  const cy = my + ny * curveStrength;
  return { fx, fy, tx, ty, cx, cy };
}

function getArrowAngle(cx, cy, tx, ty) {
  return Math.atan2(ty - cy, tx - cx);
}

export default function IntersectionFlow() {
  const [filter, setFilter] = useState("all");
  const [hovered, setHovered] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const W = 700, H = 693;

  const filtered = COUNTERS.map((c) => {
    if (filter === "all") return c;
    const val = c[filter] || 0;
    return { ...c, total: val, _filtered: true };
  });

  const currentMax = Math.max(...filtered.map((c) => c.total), 1);

  return (
    <div style={{
      background: "#0a0a0f",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "20px",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      color: "#e2e8f0",
    }}>
      <h1 style={{
        fontSize: "22px",
        fontWeight: 700,
        marginBottom: 4,
        letterSpacing: "2px",
        textTransform: "uppercase",
        color: "#94a3b8",
      }}>
        Intersection Traffic Flow
      </h1>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
        B8A44FC7F782 — 9 days — {COUNTERS.reduce((s, c) => s + c.total, 0).toLocaleString()} total crossings
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {["all", "Car", "Human", "Bus", "Truck", "Bike"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: filter === f ? "2px solid #e2e8f0" : "1px solid #334155",
              background: f === "all" ? (filter === f ? "#475569" : "#1e293b") : (filter === f ? CLASS_COLORS[f] + "44" : "#1e293b"),
              color: f === "all" ? "#e2e8f0" : CLASS_COLORS[f] || "#e2e8f0",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: filter === f ? 700 : 400,
              fontFamily: "inherit",
              transition: "all 0.2s",
            }}
          >
            {f === "all" ? "All Classes" : f}
          </button>
        ))}
      </div>

      {/* Main visualization */}
      <div style={{ position: "relative", width: W, maxWidth: "100%" }}>
        <img
          src={IMG_SRC}
          alt="Intersection"
          width={W}
          height={H}
          onLoad={() => setImgLoaded(true)}
          style={{
            display: "block",
            borderRadius: 12,
            opacity: 0.55,
            width: "100%",
            height: "auto",
          }}
        />

        {imgLoaded && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <defs>
              {filtered.map((c, i) => {
                const [fromKey, toKey] = c.direction.replace("→", "").split("");
                const from = fromKey === c.direction[0] ? fromKey : c.direction[0];
                const to = c.direction[c.direction.length - 1];
                const color = ZONE_COLORS[from];
                return (
                  <linearGradient key={`grad-${i}`} id={`grad-${i}`}
                    x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={ZONE_COLORS[from]} stopOpacity="0.9" />
                    <stop offset="100%" stopColor={ZONE_COLORS[to]} stopOpacity="0.9" />
                  </linearGradient>
                );
              })}
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Arrows */}
            {filtered.map((c, i) => {
              const parts = c.direction.split("→");
              const fromKey = parts[0];
              const toKey = parts[1];
              const from = ZONE_POSITIONS[fromKey];
              const to = ZONE_POSITIONS[toKey];

              // Find reverse and compute offset
              const reverseDir = `${toKey}→${fromKey}`;
              const hasReverse = filtered.some((r) => r.direction === reverseDir);
              const isFirst = fromKey < toKey;
              const offset = hasReverse ? (isFirst ? 1 : -1) : 0;

              const { fx, fy, tx, ty, cx, cy } = getCurvePoints(from, to, W, H, offset);
              const thickness = Math.max(1.5, (c.total / currentMax) * 14);
              const opacity = Math.max(0.25, (c.total / currentMax) * 0.9);
              const isHovered = hovered === c.direction;

              // Arrowhead
              const angle = getArrowAngle(cx, cy, tx, ty);
              const arrowSize = Math.max(6, thickness * 1.2);
              const ax1 = tx - arrowSize * Math.cos(angle - 0.4);
              const ay1 = ty - arrowSize * Math.sin(angle - 0.4);
              const ax2 = tx - arrowSize * Math.cos(angle + 0.4);
              const ay2 = ty - arrowSize * Math.sin(angle + 0.4);

              // Label position
              const t = 0.5;
              const lx = (1 - t) * (1 - t) * fx + 2 * (1 - t) * t * cx + t * t * tx;
              const ly = (1 - t) * (1 - t) * fy + 2 * (1 - t) * t * cy + t * t * ty;

              return (
                <g key={c.direction}
                  style={{ pointerEvents: "all", cursor: "pointer" }}
                  onMouseEnter={() => setHovered(c.direction)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Glow path for hover */}
                  {isHovered && (
                    <path
                      d={`M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`}
                      fill="none"
                      stroke="white"
                      strokeWidth={thickness + 6}
                      strokeOpacity={0.15}
                      filter="url(#glow)"
                    />
                  )}

                  {/* Main curve */}
                  <path
                    d={`M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`}
                    fill="none"
                    stroke={`url(#grad-${i})`}
                    strokeWidth={isHovered ? thickness + 2 : thickness}
                    strokeOpacity={isHovered ? 1 : opacity}
                    strokeLinecap="round"
                  />

                  {/* Arrowhead */}
                  <polygon
                    points={`${tx},${ty} ${ax1},${ay1} ${ax2},${ay2}`}
                    fill={ZONE_COLORS[toKey]}
                    fillOpacity={isHovered ? 1 : opacity}
                  />

                  {/* Invisible wider hit area */}
                  <path
                    d={`M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(20, thickness + 10)}
                  />

                  {/* Count label */}
                  {(c.total > currentMax * 0.03 || isHovered) && (
                    <g>
                      <rect
                        x={lx - 28}
                        y={ly - 10}
                        width={56}
                        height={20}
                        rx={4}
                        fill={isHovered ? "#1e293b" : "#0f172aCC"}
                        stroke={isHovered ? "#94a3b8" : "none"}
                        strokeWidth={1}
                      />
                      <text
                        x={lx}
                        y={ly + 4}
                        textAnchor="middle"
                        fill={isHovered ? "#fff" : "#cbd5e1"}
                        fontSize={isHovered ? 12 : 10}
                        fontWeight={isHovered ? 700 : 500}
                        fontFamily="'JetBrains Mono', monospace"
                      >
                        {c.total.toLocaleString()}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Zone labels */}
            {Object.entries(ZONE_POSITIONS).map(([key, pos]) => (
              <g key={key}>
                <circle
                  cx={pos.x * W}
                  cy={pos.y * H}
                  r={22}
                  fill={ZONE_COLORS[key]}
                  fillOpacity={0.2}
                  stroke={ZONE_COLORS[key]}
                  strokeWidth={2.5}
                />
                <text
                  x={pos.x * W}
                  y={pos.y * H + 6}
                  textAnchor="middle"
                  fill={ZONE_COLORS[key]}
                  fontSize={20}
                  fontWeight={800}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {key}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>

      {/* Tooltip / Detail panel */}
      {hovered && (() => {
        const c = COUNTERS.find((x) => x.direction === hovered);
        if (!c) return null;
        const classes = ["Car", "Human", "Bus", "Truck", "Bike", "Other"].filter((k) => c[k] > 0);
        return (
          <div style={{
            marginTop: 16,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "14px 20px",
            minWidth: 300,
            maxWidth: 460,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{c.direction}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#94a3b8" }}>
                {c.total.toLocaleString()}
              </span>
            </div>
            <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              {classes.map((cls) => (
                <div key={cls} style={{
                  width: `${(c[cls] / c.total) * 100}%`,
                  background: CLASS_COLORS[cls],
                  minWidth: c[cls] > 0 ? 2 : 0,
                }} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12 }}>
              {classes.map((cls) => (
                <span key={cls} style={{ color: CLASS_COLORS[cls] }}>
                  {cls}: {c[cls].toLocaleString()} ({((c[cls] / c.total) * 100).toFixed(1)}%)
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Legend */}
      <div style={{
        marginTop: 16,
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        justifyContent: "center",
        fontSize: 11,
        color: "#94a3b8",
      }}>
        {Object.entries(CLASS_COLORS).map(([cls, color]) => (
          <span key={cls} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: color, display: "inline-block",
            }} />
            {cls}
          </span>
        ))}
      </div>

      <p style={{ marginTop: 12, fontSize: 10, color: "#475569", textAlign: "center" }}>
        Arrow thickness proportional to count · Hover for details · Filter by class above
      </p>
    </div>
  );
}
