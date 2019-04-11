package com.honeycomb.java.demo.controller;


import com.honeycomb.java.demo.model.Message;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.io.IOException;

/**
 *
 * User: luluful
 * Date: 4/8/19
 * Time: 10:34 PM
 */
@Controller
@RequestMapping(value = "/sample")
public class SampleController {
    private Logger log = LoggerFactory.getLogger(getClass());

    private static final String MESSAGE = "Hello, World!这是一条测试语句";

    @RequestMapping(value = "/helloworld", produces = "text/plain; chartset=UTF-8")
    @ResponseBody
    public String hello() {
        return MESSAGE;
    }

    @RequestMapping(value = "/msg")
    @ResponseBody
    public Message msg() {
        return new Message(MESSAGE);
    }

    @RequestMapping(value = "/session")
    @ResponseBody
    public Message session(@RequestParam String msg, HttpSession session, HttpServletRequest req) {
        if(session.getAttribute("aaa") == null){
            session.setAttribute("aaa", msg);
            log.info("sessionId={}, setAttribute aaa={}", session.getId(), msg);
        } else {
            String oldMsg = (String) session.getAttribute("aaa");
            log.info("sessionId={} is old Session, aaa={}, from Cookie:{}, from URL:{}, valid:{}", session.getId(), oldMsg, req.isRequestedSessionIdFromCookie(), req.isRequestedSessionIdFromURL(), req.isRequestedSessionIdValid());
        }
        return new Message(MESSAGE + ". msg="+ msg);
    }

    @RequestMapping(value = "/upload", method = RequestMethod.POST)
    @ResponseBody
    public String upload(HttpServletRequest request) throws IOException {
        ServletInputStream inputStream = request.getInputStream();
        int total = 0;
        while (true) {
            byte[] bytes = new byte[8192];
            int read = inputStream.read(bytes);
            if (read == -1) {
                break;
            }
            total += read;
        }
        return "Total bytes received: " + total;
    }

    @RequestMapping("/sleepy")
    @ResponseBody
    public String sleepy() throws InterruptedException {
        int millis = 500;
        Thread.sleep(millis);
        return "Yawn! I slept for " + millis + "ms";
    }

}
